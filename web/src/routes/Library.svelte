<script lang="ts">
  import { library, session, ui } from '../lib/state.svelte';
  import { progress } from '../lib/state.svelte';
  import { chapterSpans, player } from '../lib/player.svelte';
  import { matchesQuery, preloadPinyin } from '../lib/search';
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
  // Set once the pinyin dictionary has arrived, so the filter re-runs against it.
  let pinyinReady = $state(false);

  type View = 'home' | 'books' | 'series' | 'authors' | 'narrators';

  let view = $state<View>('home');
  /** Set when a series, author or narrator has been opened. */
  let group = $state<string | null>(null);

  const VIEWS: { id: View; key: TranslationKey }[] = [
    { id: 'home', key: 'library.home' },
    { id: 'books', key: 'library.books' },
    { id: 'series', key: 'library.series' },
    { id: 'authors', key: 'library.authors' },
    { id: 'narrators', key: 'library.narrators' },
  ];

  const GROUPED = $derived(view === 'series' || view === 'authors' || view === 'narrators');

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

  // Pinyin-aware: "santi" and "st" both find 《三体》.
  const visible = $derived.by(() => {
    void pinyinReady;
    const q = query.trim();
    const base = group && GROUPED
      ? library.items.filter(item => keyOf(item, view) === group)
      : library.items;
    if (!q) {
      // The home view is a taste of the library, not the whole thing.
      return view === 'home' && !group ? base.slice(0, 60) : base;
    }
    return base.filter(item => matchesQuery(item, q));
  });

  /** "Continue listening" means unfinished rows the server actually has, newest
   *  first — not simply the first six titles in the library. */
  /** Only what was actually started: an empty shelf is honest, a shelf of
   *  unrelated books labelled "continue" is not. */
  const recent = $derived.by(() => {
    return progress.rows
      .filter(row => !row.isFinished && row.currentTime > 0)
      .sort((a, b) => b.lastUpdate - a.lastUpdate)
      .slice(0, 8)
      .map(row => library.items.find(item => item.id === row.libraryItemId))
      .filter((item): item is (typeof library.items)[number] => Boolean(item));
  });

  /** Podcasts and books both have a detail screen; the continue shelf is the
   *  one place a click starts playing, because that is what "continue" means. */
  function open(item: (typeof library.items)[number]): void {
    ui.itemId = item.id;
    ui.route = item.mediaType === 'podcast' ? 'podcast' : 'book';
  }

  function resume(item: (typeof library.items)[number]): void {
    if (item.mediaType === 'podcast') {
      open(item);
      return;
    }
    void player.open(item);
  }

  // ─── Windowed grid ─────────────────────────────────────────────────────
  // A few hundred covers are fine to render outright; a few thousand are not.
  // Above THRESHOLD only the rows in view (plus a small overscan) are mounted.
  const THRESHOLD = 240;
  const GAP = 16;
  const ROW_GAP = 24;
  // Cover is square and the caption block is ~67px; 72 keeps a hair of slack so
  // nothing is clipped by the fixed row height.
  const TEXT_H = 72;
  const MIN_W = 148;

  let searchEl = $state<HTMLInputElement | null>(null);
  let scroller = $state<HTMLDivElement | null>(null);
  let gridEl = $state<HTMLDivElement | null>(null);
  let scrollTop = $state(0);
  let viewportH = $state(0);
  let gridWidth = $state(0);
  let gridTop = $state(0);

  const windowed = $derived(visible.length > THRESHOLD);

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

  // Ctrl+F bumps this counter; the box takes focus and selects what is there.
  $effect(() => {
    void ui.focusSearch;
    if (searchEl) {
      searchEl.focus();
      searchEl.select();
    }
  });

  // A new query is a new list; staying scrolled into the old one shows nothing.
  $effect(() => {
    void query;
    if (scroller && scroller.scrollTop > 0) scroller.scrollTop = 0;
  });

  const columns = $derived(Math.max(1, Math.floor((gridWidth + GAP) / (MIN_W + GAP))));
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

  // Before the first measurement there is no column count, so a windowed grid
  // draws nothing for one frame instead of guessing and reflowing.
  const drawn = $derived(
    windowed
      ? gridWidth > 0
        ? visible.slice(startRow * columns, endRow * columns)
        : []
      : visible,
  );
  const offsetY = $derived(windowed ? startRow * stride : 0);
  const totalH = $derived(windowed ? Math.max(rowCount * stride - ROW_GAP, 0) : 0);

  function title(item: (typeof library.items)[number]): string {
    return item.media?.metadata?.title?.trim() || t('common.unknown');
  }

  async function markFinished(
    item: (typeof library.items)[number],
    finished: boolean,
  ): Promise<void> {
    const duration = item.media?.duration ?? 0;
    try {
      await updateProgress(
        session.serverUrl,
        item.id,
        finished ? duration : 0,
        duration,
        finished,
      );
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

  /** What is playing *now*: a chapter name for a book, an episode for a show.
   *  A duration tells you nothing about where you are. */
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

  function author(item: (typeof library.items)[number]): string {
    return item.media?.metadata?.authorName?.trim() || '';
  }
</script>

<div class="toolbar">
  <div class="search" style="width: 320px">
    <span class="search__icon"><Icon name="search" size={14} /></span>
    <input
      class="input"
      bind:this={searchEl}
      bind:value={query}
      placeholder={t('library.search')}
      spellcheck="false"
      onfocus={() => void preloadPinyin().then(() => (pinyinReady = true))}
    />
  </div>

  <span class="t-small t-num">{t('library.count', { count: visible.length })}</span>

  <div class="grow"></div>

  <button
    class="icon-btn"
    aria-label={t('library.refresh')}
    title={t('library.refresh')}
    onclick={() => void library.load(session.serverUrl, session.activeLibraryId, true)}
  >
    <Icon name="refresh" />
  </button>
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
                <span class="t-small t-tertiary truncate">{chapter || author(item)}</span>
                {#if fraction > 0}
                  <span class="mini-bar" aria-hidden="true">
                    <span style:width="{fraction * 100}%"></span>
                  </span>
                {/if}
              </div>
            </button>
          {/each}
        </div>
      </section>
    {/if}

    <div class="views">
      <div class="segmented">
        {#each VIEWS as entry (entry.id)}
          <button
            class="segmented__item"
            aria-pressed={view === entry.id}
            onclick={() => {
              view = entry.id;
              group = null;
            }}
          >{t(entry.key)}</button>
        {/each}
      </div>
      <span class="t-small t-num t-tertiary">
        {t('library.count', { count: visible.length })}
      </span>
    </div>

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
    {:else}
      {#if group}
        <button class="btn btn--quiet btn--sm group-back" onclick={() => (group = null)}>
          <Icon name="chevron-left" size={14} />
          {group}
        </button>
      {/if}

      <div class="grid" bind:this={gridEl} style:height={windowed ? `${totalH}px` : undefined}>
        <div
          class="grid__slice"
          class:windowed
          style:top={windowed ? `${offsetY}px` : undefined}
          style:grid-template-columns={windowed ? `repeat(${columns}, minmax(0, 1fr))` : undefined}
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
    grid-auto-columns: 260px;
    gap: var(--gap-panel);
    overflow-x: auto;
    padding-bottom: var(--gap-inline);
  }

  .shelf__card {
    display: flex;
    gap: var(--gap-panel);
    padding: var(--gap-row);
    border-radius: var(--radius-md);
    background: var(--surface);
    border: 1px solid var(--hairline);
    text-align: left;
    transition: background var(--dur-1) var(--ease), border-color var(--dur-1) var(--ease);
  }

  .shelf__card:hover {
    background: var(--surface-raised);
    border-color: var(--hairline-strong);
  }

  .shelf__cover {
    width: 64px;
    flex: 0 0 64px;
  }

  .shelf__text {
    display: flex;
    flex-direction: column;
    gap: 2px;
    justify-content: center;
    min-width: 0;
  }

  .shelf__title {
    font-weight: var(--weight-medium);
  }

  .views {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--gap-row);
    margin-bottom: var(--gap-row);
  }

  .mini-bar {
    display: block;
    height: 2px;
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
    grid-template-columns: repeat(auto-fill, minmax(148px, 1fr));
    gap: var(--gap-block) var(--gap-panel);
  }

  /* Absolute only in windowed mode: the slice is positioned by scroll offset
     while its parent reserves the full scroll height. */
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

  .groups {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
    gap: var(--gap-row);
    margin-bottom: var(--gap-section);
  }

  .group {
    display: flex;
    align-items: center;
    gap: var(--gap-row);
    padding: var(--gap-inline);
    border-radius: var(--radius-sm);
    border: 1px solid var(--hairline);
    background: var(--surface);
    text-align: left;
  }

  .group:hover {
    background: var(--surface-raised);
    border-color: var(--hairline-strong);
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
