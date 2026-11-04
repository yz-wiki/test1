<script lang="ts">
  import { library, progress, session, ui } from '../lib/state.svelte';
  import { chapterSpans, player } from '../lib/player.svelte';
  import { matchScore, preloadPinyin } from '../lib/search';
  import { menu, type MenuItem } from '../lib/menu.svelte';
  import { beginDownload } from '../lib/downloadFlow';
  import { downloads } from '../lib/downloads.svelte';
  import { updateProgress } from '../lib/ipc';
  import { t, formatLength, type TranslationKey } from '../lib/i18n.svelte';
  import Icon from '../components/Icon.svelte';
  import Cover from '../components/Cover.svelte';

  // Reload whenever the active library or server changes.
  $effect(() => {
    void library.load(session.serverUrl, session.activeLibraryId);
  });

  let query = $state('');
  let pinyinReady = $state(false);
  let sort = $state<'recent' | 'title' | 'author' | 'progress'>('recent');

  type View = 'home' | 'books' | 'series' | 'authors' | 'narrators';

  /** The sidebar owns the view now; the page switcher is a second way in. */
  const view = $derived(ui.libraryView as View);
  let group = $state<string | null>(null);

  const VIEWS: { id: View; key: TranslationKey }[] = [
    { id: 'home', key: 'library.home' },
    { id: 'books', key: 'library.books' },
    { id: 'series', key: 'library.series' },
    { id: 'authors', key: 'library.authors' },
    { id: 'narrators', key: 'library.narrators' },
  ];

  const GROUPED = $derived(view === 'series' || view === 'authors' || view === 'narrators');
  const viewName = $derived(t(VIEWS.find(entry => entry.id === view)?.key ?? 'library.home'));

  function setView(next: View): void {
    ui.setLibraryView(next);
    group = null;
    if (scroller) scroller.scrollTop = 0;
  }

  function keyOf(item: (typeof library.items)[number], by: View): string {
    const meta = item.media?.metadata;
    if (by === 'series') return meta?.seriesName?.trim() ?? '';
    if (by === 'authors') return meta?.authorName?.trim() ?? '';
    if (by === 'narrators') return meta?.narratorName?.trim() ?? '';
    return '';
  }

  const groups = $derived.by(() => {
    if (!GROUPED) return [];
    const map = new Map<string, typeof library.items>();
    for (const item of library.items) {
      const key = keyOf(item, view);
      if (!key) continue;
      const bucket = map.get(key);
      if (bucket) bucket.push(item);
      else map.set(key, [item]);
    }
    return [...map.entries()]
      .map(([name, items]) => ({ name, items }))
      .sort((a, b) => b.items.length - a.items.length || a.name.localeCompare(b.name));
  });

  /** Pinyin-aware, multi-word, ranked. A title hit beats an author hit. */
  const visible = $derived.by(() => {
    void pinyinReady;
    const q = query.trim();
    const base = group && GROUPED
      ? library.items.filter(item => keyOf(item, view) === group)
      : library.items;

    if (q) {
      const scored = new Map<string, number>();
      const hits = base.filter(item => {
        const score = matchScore(item, q);
        if (score > 0) scored.set(item.id, score);
        return score > 0;
      });
      return hits.sort((a, b) => (scored.get(b.id) ?? 0) - (scored.get(a.id) ?? 0));
    }

    let list = view === 'home' && !group ? base.slice(0, 60) : [...base];
    if (sort === 'title') {
      list.sort((a, b) => title(a).localeCompare(title(b), 'zh-CN'));
    } else if (sort === 'author') {
      list.sort((a, b) => author(a).localeCompare(author(b), 'zh-CN'));
    } else if (sort === 'progress') {
      list.sort((a, b) => progress.fraction(b.id) - progress.fraction(a.id));
    }
    return list;
  });

  const recent = $derived.by(() => {
    return progress.rows
      .filter(row => !row.isFinished && row.currentTime > 0)
      .sort((a, b) => b.lastUpdate - a.lastUpdate)
      .slice(0, 8)
      .map(row => library.items.find(item => item.id === row.libraryItemId))
      .filter((item): item is (typeof library.items)[number] => Boolean(item));
  });

  function open(item: (typeof library.items)[number]): void {
    ui.itemId = item.id;
    ui.route = item.mediaType === 'podcast' ? 'podcast' : 'book';
  }

  /** "Continue" means both: resume playback AND show where it is playing. */
  function resume(item: (typeof library.items)[number]): void {
    if (item.mediaType === 'podcast') {
      open(item);
      return;
    }
    void player.open(item).then(() => player.expand());
  }

  // ─── Windowed grid ─────────────────────────────────────────────────────
  const THRESHOLD = 240;
  const GAP = 16;
  const ROW_GAP = 24;
  const TEXT_H = 72;

  let searchEl = $state<HTMLInputElement | null>(null);
  let scroller = $state<HTMLDivElement | null>(null);
  let gridEl = $state<HTMLDivElement | null>(null);
  let scrollTop = $state(0);
  let viewportH = $state(0);
  let gridWidth = $state(0);
  let gridTop = $state(0);

  const isList = $derived(ui.libraryLayout === 'list');
  const windowed = $derived(!isList && visible.length > THRESHOLD);
  const minW = $derived(ui.tileSize);

  $effect(() => {
    const el = scroller;
    if (!el) return;
    const measure = () => {
      viewportH = el.clientHeight;
      if (gridEl) {
        gridWidth = gridEl.clientWidth;
        gridTop = gridEl.offsetTop;
      }
    };
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    if (gridEl) observer.observe(gridEl);
    measure();
    return () => observer.disconnect();
  });

  function onScroll(event: Event): void {
    scrollTop = (event.currentTarget as HTMLElement).scrollTop;
  }

  $effect(() => {
    void ui.focusSearch;
    if (searchEl) {
      searchEl.focus();
      searchEl.select();
    }
  });

  $effect(() => {
    void query;
    void ui.libraryView;
    if (scroller && scroller.scrollTop > 0) scroller.scrollTop = 0;
  });

  const columns = $derived(Math.max(1, Math.floor((gridWidth + GAP) / (minW + GAP))));
  const tileW = $derived(columns > 0 ? (gridWidth - GAP * (columns - 1)) / columns : 0);
  const tileH = $derived(tileW + TEXT_H);
  const stride = $derived(tileH + ROW_GAP);
  const rowCount = $derived(Math.ceil(visible.length / columns));

  const startRow = $derived.by(() => {
    if (!windowed) return 0;
    const offset = Math.max(scrollTop - gridTop, 0);
    const row = Math.floor(offset / Math.max(stride, 1)) - 2;
    return Math.min(Math.max(row, 0), Math.max(rowCount - 1, 0));
  });
  const endRow = $derived.by(() => {
    if (!windowed) return rowCount;
    const offset = Math.max(scrollTop - gridTop, 0);
    const row = Math.ceil((offset + viewportH) / Math.max(stride, 1)) + 2;
    return Math.min(Math.max(row, startRow + 1), rowCount);
  });

  const drawn = $derived(
    windowed ? (gridWidth > 0 ? visible.slice(startRow * columns, endRow * columns) : []) : visible,
  );
  const offsetY = $derived(windowed ? startRow * stride : 0);
  const totalH = $derived(windowed ? Math.max(rowCount * stride - ROW_GAP, 0) : 0);

  function title(item: (typeof library.items)[number]): string {
    return item.media?.metadata?.title?.trim() || t('common.unknown');
  }

  function author(item: (typeof library.items)[number]): string {
    return item.media?.metadata?.authorName?.trim() || '';
  }

  async function markFinished(
    item: (typeof library.items)[number],
    finished: boolean,
  ): Promise<void> {
    const duration = item.media?.duration ?? 0;
    try {
      await updateProgress(session.serverUrl, item.id, finished ? duration : 0, duration, finished);
      await progress.load(session.serverUrl, true);
    } catch {
      // The shelf is a read-only surface; a failed write is not worth a banner.
    }
  }

  function openMenu(event: MouseEvent, item: (typeof library.items)[number]): void {
    const isPodcast = item.mediaType === 'podcast';
    const downloaded = downloads.has(item.id);
    const busy = Boolean(downloads.transfers[item.id]);
    const finished = progress.for(item.id)?.isFinished ?? false;

    const items: MenuItem[] = [
      { id: 'play', label: t('menu.play'), action: () => resume(item) },
      { id: 'details', label: t('menu.details'), action: () => open(item) },
    ];

    if (!isPodcast) {
      items.push(
        {
          id: 'download',
          label: downloaded ? t('downloads.downloaded') : t('downloads.download'),
          disabled: downloaded || busy,
          separatorBefore: true,
          action: () => void beginDownload(item, title(item), author(item)),
        },
        {
          id: 'remove',
          label: t('downloads.remove'),
          danger: true,
          disabled: !downloaded,
          action: () => void downloads.remove(item.id),
        },
        {
          id: 'finished',
          label: finished ? t('menu.markUnfinished') : t('menu.markFinished'),
          separatorBefore: true,
          action: () => void markFinished(item, !finished),
        },
      );
    }

    items.push({
      id: 'copy',
      label: t('menu.copyTitle'),
      separatorBefore: true,
      action: () => void navigator.clipboard.writeText(title(item)),
    });

    menu.show(event, items);
  }

  /** What is playing *now*: a chapter name for a book, an episode for a show. */
  function currentChapter(item: (typeof library.items)[number]): string {
    const row = progress.for(item.id);
    if (!row) return '';
    if (item.mediaType === 'podcast') {
      const episode = item.media?.episodes?.find(entry => entry.id === row.episodeId);
      return episode?.title ?? '';
    }
    const spans = chapterSpans(item);
    for (let index = spans.length - 1; index >= 0; index -= 1) {
      if (row.currentTime >= spans[index].start) return spans[index].title;
    }
    return '';
  }
</script>

<div class="toolbar">
  <div class="toolbar__left">
    <span class="toolbar__library truncate">{session.activeLibrary?.name ?? t('app.name')}</span>
    <span class="t-small t-tertiary t-num">{t('library.total', { count: library.items.length })}</span>
  </div>

  <div class="search">
    <span class="search__icon"><Icon name="search" size={14} /></span>
    <input
      class="input"
      bind:this={searchEl}
      bind:value={query}
      placeholder={t('library.search')}
      title={t('library.searchHint')}
      spellcheck="false"
      onfocus={() => void preloadPinyin().then(() => (pinyinReady = true))}
    />
  </div>

  <div class="toolbar__right">
    {#if query.trim()}
      <span class="t-small t-num t-accent">{t('library.found', { count: visible.length })}</span>
    {/if}

    <select class="select select--sm" bind:value={sort} aria-label={t('library.sort')} title={t('library.sort')}>
      <option value="recent">{t('library.sort.recent')}</option>
      <option value="title">{t('library.sort.title')}</option>
      <option value="author">{t('library.sort.author')}</option>
      <option value="progress">{t('library.sort.progress')}</option>
    </select>

    <div class="segmented segmented--tools" role="group" aria-label={t('library.layout.grid')}>
      <button
        class="segmented__item"
        aria-pressed={!isList}
        title={t('library.layout.grid')}
        onclick={() => ui.setLibraryLayout('grid')}
      ><Icon name="grid" size={14} /></button>
      <button
        class="segmented__item"
        aria-pressed={isList}
        title={t('library.layout.list')}
        onclick={() => ui.setLibraryLayout('list')}
      ><Icon name="rows" size={14} /></button>
    </div>

    {#if !isList}
      <div class="sizer" title={t('library.tileSize')}>
        <button class="icon-btn icon-btn--sm" aria-label={t('library.tileSize')} onclick={() => ui.setTileSize(ui.tileSize - 20)}>
          <Icon name="minus" size={13} />
        </button>
        <button class="icon-btn icon-btn--sm" aria-label={t('library.tileSize')} onclick={() => ui.setTileSize(ui.tileSize + 20)}>
          <Icon name="plus" size={13} />
        </button>
      </div>
    {/if}

    <button
      class="icon-btn"
      aria-label={t('library.refresh')}
      title={t('library.refresh')}
      onclick={() => void library.load(session.serverUrl, session.activeLibraryId, true)}
    >
      <Icon name="refresh" />
    </button>
  </div>
</div>

<div class="page scroll-y" bind:this={scroller} onscroll={onScroll}>
  {#if library.error}
    <div class="empty">
      <span class="empty__title">{t('library.error')}</span>
      <span class="empty__body">{library.error}</span>
      <button class="btn btn--sm" onclick={() => void library.load(session.serverUrl, session.activeLibraryId, true)}>
        {t('library.retry')}
      </button>
    </div>
  {:else if library.loading && library.items.length === 0}
    <div class="grid">
      {#each Array(12) as _, i (i)}
        <div class="skeleton" aria-hidden="true"></div>
      {/each}
    </div>
  {:else}
    {#if recent.length > 0 && !GROUPED && !group}
      <section class="section">
        <h2 class="t-label">{t('library.continue')}</h2>
        <div class="shelf">
          {#each recent as item (item.id)}
            {@const fraction = progress.fraction(item.id)}
            {@const chapter = currentChapter(item)}
            <button
              class="shelf__card"
              onclick={() => resume(item)}
              oncontextmenu={event => openMenu(event, item)}
            >
              <div class="shelf__cover">
                <Cover itemId={item.id} size={168} title={title(item)} />
              </div>
              <div class="shelf__text">
                <span class="truncate shelf__title">{title(item)}</span>
                <span class="t-small t-tertiary truncate shelf__chapter">
                  {chapter || author(item)}
                </span>
                <span class="shelf__foot">
                  <span class="mini-bar" aria-hidden="true">
                    <span style:width="{Math.max(fraction * 100, 2)}%"></span>
                  </span>
                  <span class="t-num t-tertiary shelf__pct">{Math.round(fraction * 100)}%</span>
                </span>
              </div>
            </button>
          {/each}
        </div>
      </section>
    {/if}

    <!-- Centred, high-contrast view switch. Selecting one is a real page
         change: the heading, the count and the content all follow. -->
    <div class="viewbar">
      <div class="viewbar__head">
        <h1 class="viewbar__title">{group ?? viewName}</h1>
        <span class="t-small t-tertiary t-num">
          {t('library.count', { count: visible.length })}
        </span>
      </div>

      <div class="views">
        <div class="segmented segmented--views">
          {#each VIEWS as entry (entry.id)}
            <button
              class="segmented__item"
              aria-pressed={view === entry.id}
              onclick={() => setView(entry.id)}
            >{t(entry.key)}</button>
          {/each}
        </div>
      </div>

      <p class="t-small t-tertiary viewbar__hint">{t('library.viewHint')}</p>
    </div>

    {#if group}
      <button class="btn btn--quiet btn--sm group-back" onclick={() => (group = null)}>
        <Icon name="chevron-left" size={14} />
        {viewName}
      </button>
    {/if}

    {#if GROUPED && group === null}
      {#if groups.length === 0}
        <div class="empty">
          <Icon name="book" size={26} />
          <span class="empty__title">{t('library.noGroups')}</span>
        </div>
      {:else}
        <div class="groups">
          {#each groups as entry (entry.name)}
            <button class="group" onclick={() => (group = entry.name)}>
              <span class="group__cover">
                <Cover itemId={entry.items[0].id} size={120} title={entry.name} />
              </span>
              <span class="group__text">
                <span class="truncate group__name">{entry.name}</span>
                <span class="t-small t-tertiary t-num">{entry.items.length}</span>
              </span>
              <Icon name="chevron-right" size={13} />
            </button>
          {/each}
        </div>
      {/if}
    {:else if visible.length === 0}
      <div class="empty">
        <Icon name="book" size={26} />
        <span class="empty__title">{t('library.empty')}</span>
        <span class="empty__body">{t('library.emptyHint')}</span>
      </div>
    {:else if isList}
      <div class="list">
        {#each visible as item (item.id)}
          {@const fraction = progress.fraction(item.id)}
          {@const chapter = currentChapter(item)}
          <button
            class="list__row"
            aria-current={player.item?.id === item.id && player.playing ? 'true' : undefined}
            onclick={() => open(item)}
            oncontextmenu={event => openMenu(event, item)}
          >
            <span class="list__cover"><Cover itemId={item.id} size={96} title={title(item)} /></span>
            <span class="list__main">
              <span class="truncate list__title">{title(item)}</span>
              <span class="t-small t-tertiary truncate">{chapter || author(item)}</span>
            </span>
            <span class="list__progress">
              <span class="mini-bar" aria-hidden="true"><span style:width="{fraction * 100}%"></span></span>
              <span class="t-small t-num t-tertiary">{Math.round(fraction * 100)}%</span>
            </span>
            <span class="t-small t-num t-tertiary list__len">
              {formatLength(item.media?.duration ?? 0)}
            </span>
          </button>
        {/each}
      </div>
    {:else}
      <div class="grid" bind:this={gridEl} style:height={windowed ? `${totalH}px` : undefined}>
        <div
          class="grid__slice"
          class:windowed
          style:top={windowed ? `${offsetY}px` : undefined}
          style:grid-template-columns={windowed ? `repeat(${columns}, minmax(0, 1fr))` : `repeat(auto-fill, minmax(${minW}px, 1fr))`}
          style:grid-auto-rows={windowed ? `${tileH}px` : undefined}
        >
          {#each drawn as item (item.id)}
            <button
              class="tile"
              aria-current={player.item?.id === item.id && player.playing ? 'true' : undefined}
              onclick={() => open(item)}
              oncontextmenu={event => openMenu(event, item)}
            >
              <Cover itemId={item.id} size={320} title={title(item)} />
              <span class="tile__title">{title(item)}</span>
              <span class="tile__meta">{author(item) || formatLength(item.media?.duration ?? 0)}</span>
            </button>
          {/each}
        </div>
      </div>
    {/if}
  {/if}
</div>

<style>
  .toolbar {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(220px, 420px) minmax(0, 1fr);
    align-items: center;
    gap: var(--gap-row);
    padding: var(--gap-inline) var(--gap-block);
    border-bottom: 1px solid var(--hairline);
    background: var(--surface);
  }

  .toolbar__left {
    display: flex;
    align-items: baseline;
    gap: var(--gap-inline);
    min-width: 0;
  }

  .toolbar__library {
    font-size: var(--text-sm);
    font-weight: var(--weight-medium);
  }

  .toolbar__right {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 6px;
    min-width: 0;
  }

  .search {
    position: relative;
    width: 100%;
  }

  .search__icon {
    position: absolute;
    left: 10px;
    top: 50%;
    transform: translateY(-50%);
    color: var(--text-tertiary);
    pointer-events: none;
  }

  .search .input {
    width: 100%;
    padding-left: 32px;
  }

  .select--sm {
    width: auto;
    min-width: 92px;
    height: var(--control-sm);
    font-size: var(--text-xs);
  }

  .segmented--tools .segmented__item {
    display: grid;
    place-items: center;
    padding-inline: 9px;
  }

  .sizer {
    display: flex;
    gap: 1px;
  }

  .page {
    position: relative;
    flex: 1 1 auto;
    min-height: 0;
    padding: var(--gap-block);
  }

  .section {
    margin-bottom: var(--gap-section);
  }

  .section > .t-label {
    display: block;
    margin-bottom: var(--gap-row);
  }

  .shelf {
    display: grid;
    grid-auto-flow: column;
    grid-auto-columns: 272px;
    gap: var(--gap-row);
    overflow-x: auto;
    padding-bottom: var(--gap-inline);
    scrollbar-width: thin;
  }

  .shelf__card {
    display: flex;
    gap: var(--gap-row);
    padding: 10px;
    border-radius: var(--radius-md);
    background: var(--surface);
    border: 1px solid var(--hairline);
    text-align: left;
    transition: transform var(--dur-1) var(--ease), background var(--dur-1) var(--ease),
      border-color var(--dur-1) var(--ease);
  }

  .shelf__card:hover {
    transform: translateY(-2px);
    background: var(--surface-raised);
    border-color: var(--accent-line);
  }

  .shelf__cover {
    width: 58px;
    flex: 0 0 58px;
  }

  .shelf__text {
    display: flex;
    flex-direction: column;
    justify-content: center;
    gap: 3px;
    min-width: 0;
    flex: 1 1 auto;
  }

  .shelf__title {
    font-size: var(--text-sm);
    font-weight: var(--weight-medium);
  }

  .shelf__chapter {
    color: var(--text-secondary);
  }

  .shelf__foot {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .shelf__foot .mini-bar {
    flex: 1 1 auto;
    margin-top: 0;
  }

  .shelf__pct {
    font-size: var(--text-2xs);
  }

  .viewbar {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
    padding: var(--gap-row) 0 var(--gap-block);
    margin-bottom: var(--gap-row);
    border-bottom: 1px solid var(--hairline);
  }

  .viewbar__head {
    display: flex;
    align-items: baseline;
    gap: var(--gap-inline);
  }

  .viewbar__title {
    font-size: var(--text-xl);
    font-weight: var(--weight-semibold);
    letter-spacing: -0.01em;
  }

  .views {
    display: flex;
    justify-content: center;
    width: 100%;
  }

  /* Active view gets a solid accent pill: a grey underline was invisible. */
  .views :global(.segmented--views) {
    gap: 2px;
    padding: 3px;
    background: var(--surface-inset);
    border: 1px solid var(--hairline);
  }

  .views :global(.segmented__item) {
    padding: 6px 18px;
    font-size: var(--text-sm);
    color: var(--text-secondary);
  }

  .views :global(.segmented__item[aria-pressed='true']) {
    background: var(--accent);
    color: var(--on-accent);
    font-weight: var(--weight-medium);
    box-shadow: 0 1px 4px rgb(0 0 0 / 0.14);
  }

  .viewbar__hint {
    font-size: var(--text-2xs);
  }

  .mini-bar {
    display: block;
    height: 3px;
    margin-top: 5px;
    border-radius: var(--radius-pill);
    background: var(--surface-inset);
    overflow: hidden;
  }

  .mini-bar > span {
    display: block;
    height: 100%;
    background: var(--accent);
  }

  .grid {
    position: relative;
  }

  .grid__slice {
    display: grid;
    gap: var(--gap-block) var(--gap-panel);
  }

  .grid__slice.windowed {
    position: absolute;
    left: 0;
    right: 0;
    gap: 24px 16px;
  }

  .grid__slice.windowed .tile {
    min-height: 0;
    overflow: hidden;
  }

  .list {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .list__row {
    display: grid;
    grid-template-columns: 40px minmax(0, 1fr) 140px 90px;
    align-items: center;
    gap: var(--gap-row);
    padding: 7px var(--gap-row);
    border-radius: var(--radius-sm);
    text-align: left;
  }

  .list__row:hover,
  .list__row[aria-current='true'] {
    background: var(--surface-raised);
  }

  .list__cover {
    width: 40px;
    height: 40px;
    border-radius: var(--radius-xs);
    overflow: hidden;
  }

  .list__main {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }

  .list__title {
    font-size: var(--text-sm);
    font-weight: var(--weight-medium);
  }

  .list__progress {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .list__progress .mini-bar {
    flex: 1 1 auto;
    margin-top: 0;
  }

  .list__len {
    text-align: right;
  }

  .groups {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
    gap: var(--gap-row);
    margin-bottom: var(--gap-section);
  }

  .group {
    display: flex;
    align-items: center;
    gap: var(--gap-row);
    padding: var(--gap-inline) var(--gap-row);
    border-radius: var(--radius-sm);
    border: 1px solid var(--hairline);
    background: var(--surface);
    text-align: left;
    color: var(--text-tertiary);
  }

  .group:hover {
    background: var(--surface-raised);
    border-color: var(--accent-line);
    color: var(--accent);
  }

  .group__cover {
    width: 44px;
    height: 44px;
    flex: 0 0 44px;
    border-radius: var(--radius-xs);
    overflow: hidden;
  }

  .group__text {
    display: flex;
    flex: 1 1 auto;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }

  .group__name {
    font-size: var(--text-sm);
    font-weight: var(--weight-medium);
    color: var(--text);
  }

  .group-back {
    align-self: flex-start;
    margin-bottom: var(--gap-row);
  }

  .skeleton {
    aspect-ratio: 0.72;
    border-radius: var(--radius-md);
    background: linear-gradient(100deg, var(--surface) 30%, var(--surface-raised) 50%, var(--surface) 70%);
    background-size: 220% 100%;
    animation: shimmer 1.4s linear infinite;
  }

  @keyframes shimmer {
    from { background-position: 140% 0; }
    to { background-position: -40% 0; }
  }
</style>
