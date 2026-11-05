<script lang="ts">
  import { library, progress, session, ui } from '../lib/state.svelte';
  import { player } from '../lib/player.svelte';
  import { playItem } from '../lib/playFlow';
  import { matchScore, preloadPinyin } from '../lib/search';
  import { reading } from '../lib/reading.svelte';
  import { menu, type MenuItem } from '../lib/menu.svelte';
  import { beginDownload } from '../lib/downloadFlow';
  import { downloads } from '../lib/downloads.svelte';
  import { updateProgress } from '../lib/ipc';
  import { t, formatLength, type TranslationKey } from '../lib/i18n.svelte';
  import Icon from '../components/Icon.svelte';
  import Cover from '../components/Cover.svelte';
  import LibrarySwitcher from '../components/LibrarySwitcher.svelte';
  import Dropdown from '../components/Dropdown.svelte';
  import type { IconName } from '../components/Icon.svelte';

  // Reload whenever the active library or server changes.
  $effect(() => {
    void library.load(session.serverUrl, session.activeLibraryId);
  });

  let query = $state('');
  let pinyinReady = $state(false);
  let sort = $state<'recent' | 'title' | 'author' | 'progress'>('recent');
  let filter = $state<'all' | 'unfinished' | 'finished'>('all');

  type View = 'home' | 'books' | 'series' | 'authors' | 'narrators';

  /** The sidebar owns the view now; the page switcher is a second way in. */
  const view = $derived(ui.libraryView as View);
  let group = $state<string | null>(null);

  const VIEWS: { id: View; key: TranslationKey; icon: IconName }[] = [
    { id: 'home', key: 'library.home', icon: 'home' },
    { id: 'books', key: 'library.books', icon: 'book' },
    { id: 'series', key: 'library.series', icon: 'layers' },
    { id: 'authors', key: 'library.authors', icon: 'user' },
    { id: 'narrators', key: 'library.narrators', icon: 'mic' },
  ];

  const GROUPED = $derived(view === 'series' || view === 'authors' || view === 'narrators');
  /** Home is a dashboard, not a 60-item grid with a shelf stapled on top. */
  const isHome = $derived(view === 'home' && !group && !query.trim());

  const viewName = $derived(t(VIEWS.find(entry => entry.id === view)?.key ?? 'library.home'));

  function setView(next: View): void {
    ui.setLibraryView(next);
    group = null;
    if (scroller) scroller.scrollTop = 0;
  }

  function keyOf(item: (typeof library.items)[number], by: View): string {
    const meta = item.media?.metadata;
    if (by === 'series') return seriesOf(item);
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

  /** Largest group, so the list view can draw a comparable share bar. */
  const maxGroupSize = $derived(
    groups.reduce((max, entry) => Math.max(max, entry.items.length), 1),
  );

  /**
   * Home keeps the two-column shape: the listening history stays put on the
   * left, and the right side switches what it lists. The four category cards
   * that used to live here navigated away; a segmented row answers the same
   * question in place, so the rail stays the only way to leave the page.
   */
  let homeTab = $state<'books' | 'series' | 'authors' | 'narrators'>('books');

  function categoryCount(by: View): number {
    return new Set(library.items.map(item => keyOf(item, by)).filter(Boolean)).size;
  }

  const homeTabs = $derived([
    { id: 'books' as const, key: 'library.books' as TranslationKey, count: library.items.length },
    { id: 'series' as const, key: 'library.series' as TranslationKey, count: categoryCount('series') },
    { id: 'authors' as const, key: 'library.authors' as TranslationKey, count: categoryCount('authors') },
    { id: 'narrators' as const, key: 'library.narrators' as TranslationKey, count: categoryCount('narrators') },
  ]);

  /** Grouped categories for the right-hand panel, largest group first. */
  const homeGroups = $derived.by(() => {
    if (homeTab === 'books') return [];
    const map = new Map<string, typeof library.items>();
    for (const item of library.items) {
      const key = keyOf(item, homeTab);
      if (!key) continue;
      const bucket = map.get(key);
      if (bucket) bucket.push(item);
      else map.set(key, [item]);
    }
    return [...map.entries()]
      .map(([name, items]) => ({ name, items }))
      .sort((a, b) => b.items.length - a.items.length || a.name.localeCompare(b.name, 'zh-CN'));
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

    let list: typeof library.items = [...base];
    if (filter === 'finished') {
      list = list.filter(item => progress.for(item.id)?.isFinished === true);
    } else if (filter === 'unfinished') {
      list = list.filter(item => progress.for(item.id)?.isFinished !== true);
    }
    if (view === 'home' && !group) list = list.slice(0, 60);
    if (sort === 'title') {
      list.sort((a, b) => title(a).localeCompare(title(b), 'zh-CN'));
    } else if (sort === 'author') {
      list.sort((a, b) => author(a).localeCompare(author(b), 'zh-CN'));
    } else if (sort === 'progress') {
      list.sort((a, b) => progress.fraction(b.id) - progress.fraction(a.id));
    }
    return list;
  });

  /**
   * Newest first, one card per book. The previous version collapsed rows by
   * `seriesName`, but Audiobookshelf leaves that field empty — or fills it per
   * volume — so a 12-volume series came out as 12 cards each claiming "共 1 卷".
   * A plain reverse-chronological shelf is honest; the series name goes into
   * the meta line only when the server really provides one.
   */
  const recentAdded = $derived.by(() =>
    [...library.items].sort((a, b) => (b.addedAt ?? 0) - (a.addedAt ?? 0)).slice(0, 12),
  );

  /** Series name for an item, preferring the newer `series[]` array ABS sends. */
  function seriesOf(item: (typeof library.items)[number]): string {
    const meta = item.media?.metadata;
    return meta?.series?.[0]?.name?.trim() || meta?.seriesName?.trim() || '';
  }

  /** "今天 / 3 天前" — the shelf reads better with a date than with a timestamp. */
  function ago(at?: number): string {
    if (!at) return '';
    const days = Math.floor((Date.now() - at) / 86_400_000);
    if (days <= 0) return t('home.agoToday');
    if (days === 1) return t('home.agoYesterday');
    if (days < 30) return t('home.agoDays', { count: days });
    const months = Math.floor(days / 30);
    if (months < 12) return t('home.agoMonths', { count: months });
    return t('home.agoYears', { count: Math.floor(months / 12) });
  }

  const recent = $derived.by(() => {
    return progress.rows
      .filter(row => !row.isFinished && row.currentTime > 0)
      .sort((a, b) => b.lastUpdate - a.lastUpdate)
      .slice(0, 8)
      .map(row => library.items.find(item => item.id === row.libraryItemId))
      .filter((item): item is (typeof library.items)[number] => Boolean(item));
  });

  $effect(() => {
    void reading.ensure(session.serverUrl, recent.map(item => item.id));
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
    void playItem(item);
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
  const minW = 148;

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
          id: 'downloadTo',
          label: t('menu.downloadTo'),
          disabled: busy,
          action: () => void beginDownload(item, title(item), author(item), true),
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
    const chapter = reading.chapterAt(item, row.currentTime);
    if (!chapter) return '';
    return `${t('continue.chapter', { index: chapter.index, total: chapter.total })} · ${chapter.title}`;
  }
</script>

<div class="toolbar">
  <div class="toolbar__left">
    <LibrarySwitcher />
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
      {#if query.trim()}<span class="t-small t-num t-accent found">{t('library.found', { count: visible.length })}</span>{/if}
    {/if}

    <Dropdown
      value={filter}
      options={[
        { value: 'all', label: t('library.filter.all') },
        { value: 'unfinished', label: t('library.filter.unfinished') },
        { value: 'finished', label: t('library.filter.finished') },
      ]}
      onSelect={next => (filter = next as 'all' | 'unfinished' | 'finished')}
      label={t('library.filter')}
      variant="field"
    />

    <Dropdown
      value={sort}
      options={[
        { value: 'recent', label: t('library.sort.recent') },
        { value: 'title', label: t('library.sort.title') },
        { value: 'author', label: t('library.sort.author') },
        { value: 'progress', label: t('library.sort.progress') },
      ]}
      onSelect={next => (sort = next as 'recent' | 'title' | 'author' | 'progress')}
      label={t('library.sort')}
      variant="field"
    />

    <span class="toolbar__sep"></span>

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

    <span class="toolbar__sep"></span>

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

<div class="page scroll-y" class:page--home={isHome} bind:this={scroller} onscroll={onScroll}>
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
    {#if isHome}
      <div class="home">
        <aside class="home__side">
          <section class="home__panel">
            <div class="panel__head">
              <h2 class="t-label">{t('library.continue')}</h2>
              <button class="btn btn--quiet btn--sm" onclick={() => (ui.route = 'continue')}>
                {t('continue.viewAll')} <Icon name="chevron-right" size={12} />
              </button>
            </div>

            {#if recent.length > 0}
              {@const top = recent[0]}
              {@const chapter = reading.chapterAt(top, progress.for(top.id)?.currentTime ?? 0)}
              {@const pct = Math.round(progress.fraction(top.id) * 100)}
              <div class="hero">
                <div class="hero__top">
                  <button class="hero__cover" onclick={() => open(top)} title={title(top)}>
                    <Cover itemId={top.id} size={240} title={title(top)} />
                  </button>
                  <div class="hero__body">
                    <span class="hero__tag">{t('home.inProgress')}</span>
                    <h3 class="hero__title clamp-2">{title(top)}</h3>
                    <span class="t-small t-tertiary truncate">{author(top)}</span>
                    {#if chapter}
                      <span class="t-small t-tertiary truncate" title={chapter.title}>
                        {t('continue.chapter', { index: chapter.index, total: chapter.total })} · {chapter.title}
                      </span>
                    {/if}
                  </div>
                </div>

                <div class="hero__bar" aria-hidden="true"><span style:width="{pct}%"></span></div>
                <div class="hero__foot t-num t-small t-tertiary">
                  <span>{formatLength((top.media?.duration ?? 0) * progress.fraction(top.id))} / {formatLength(top.media?.duration ?? 0)}</span>
                  <span>{pct}%</span>
                </div>

                <div class="hero__actions">
                  <button class="btn btn--primary btn--sm" onclick={() => resume(top)}>
                    <Icon name="play" size={13} /> {t('home.resume')}
                  </button>
                  <button class="btn btn--quiet btn--sm" onclick={() => open(top)}>{t('home.details')}</button>
                </div>
              </div>

              {#if recent.length > 1}
                <div class="queue">
                  {#each recent.slice(1, 6) as item (item.id)}
                    {@const fraction = progress.fraction(item.id)}
                    <button class="queue__row" onclick={() => resume(item)} oncontextmenu={event => openMenu(event, item)}>
                      <span class="queue__cover"><Cover itemId={item.id} size={96} title={title(item)} /></span>
                      <span class="queue__text">
                        <span class="truncate">{title(item)}</span>
                        <span class="t-small t-tertiary truncate">{currentChapter(item) || author(item)}</span>
                      </span>
                      <span class="t-num t-small t-tertiary">{Math.round(fraction * 100)}%</span>
                    </button>
                  {/each}
                </div>
              {/if}
            {:else}
              <p class="t-small t-tertiary home__empty">{t('continue.empty')}</p>
            {/if}
          </section>
        </aside>

        <section class="home__main">
          <div class="home__bar">
            <span class="home__spacer" aria-hidden="true"></span>
            <div class="home-tabs" role="group" aria-label={t('home.categories')}>
              {#each homeTabs as entry (entry.id)}
                <button
                  class="home-tabs__item"
                  aria-pressed={homeTab === entry.id}
                  onclick={() => (homeTab = entry.id)}
                >
                  {t(entry.key)}
                  <span class="home-tabs__count t-num">{entry.count}</span>
                </button>
              {/each}
            </div>
            <button class="btn btn--quiet btn--sm home__all" onclick={() => setView(homeTab)}>
              {t('home.viewAll')} <Icon name="chevron-right" size={12} />
            </button>
          </div>

          {#if homeTab === 'books'}
            <div class="home-grid">
              {#each recentAdded as item (item.id)}
                <button
                  class="tile"
                  onclick={() => open(item)}
                  oncontextmenu={event => openMenu(event, item)}
                >
                  <Cover itemId={item.id} size={320} title={title(item)} />
                  <span class="tile__title">{title(item)}</span>
                  <span class="tile__meta">
                    {[seriesOf(item), ago(item.addedAt)].filter(Boolean).join(' · ') || author(item)}
                  </span>
                </button>
              {/each}
            </div>
          {:else}
            <div class="home-groups">
              {#each homeGroups as entry (entry.name)}
                <button
                  class="home-group"
                  onclick={() => {
                    setView(homeTab);
                    group = entry.name;
                  }}
                >
                  <span class="home-group__cover">
                    <Cover itemId={entry.items[0].id} size={96} title={entry.name} />
                  </span>
                  <span class="home-group__text">
                    <span class="truncate">{entry.name}</span>
                    <span class="t-small t-tertiary t-num">
                      {t('library.count', { count: entry.items.length })}
                    </span>
                  </span>
                  <Icon name="chevron-right" size={13} />
                </button>
              {/each}
              {#if homeGroups.length === 0}
                <p class="t-small t-tertiary home__empty">{t('library.noGroups')}</p>
              {/if}
            </div>
          {/if}
        </section>
      </div>
    {:else}
    <div class="viewbar">
      <div class="viewbar__head">
        <h1 class="viewbar__title">{group ?? viewName}</h1>
        <span class="viewbar__count t-small t-tertiary t-num">
          {t('library.count', { count: visible.length })}
        </span>
      </div>

      <div class="segmented segmented--views">
        {#each VIEWS.filter(entry => entry.id !== 'home') as entry (entry.id)}
          <button
            class="segmented__item"
            aria-pressed={view === entry.id}
            onclick={() => setView(entry.id)}
          >{t(entry.key)}</button>
        {/each}
      </div>
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
        <!-- One tree, two shapes. The old build swapped two different DOM
             branches, so a layout click looked like it did nothing whenever
             the two branches happened to render similar cards. -->
        <div class="groups" class:groups--list={isList}>
          {#each groups as entry (entry.name)}
            <button class="group" onclick={() => (group = entry.name)}>
              <span class="group__cover">
                <Cover itemId={entry.items[0].id} size={160} title={entry.name} />
              </span>
              <span class="group__text">
                <span class="truncate group__name">{entry.name}</span>
                <span class="t-small t-tertiary t-num">
                  {t('library.count', { count: entry.items.length })}
                </span>
              </span>
              <!-- The share bar only exists in list mode: it is the one extra
                   fact worth a row that a card has no space for. -->
              <span class="group__share" aria-hidden="true">
                <span style:width="{Math.round((entry.items.length / maxGroupSize) * 100)}%"></span>
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
              <span class="t-small t-tertiary truncate list__extra">
                {[item.media?.metadata?.seriesName, item.media?.metadata?.narratorName].filter(Boolean).join(' · ') || ''}
              </span>
            </span>
            <span class="list__tag" class:on={fraction > 0} class:done={progress.for(item.id)?.isFinished}>
              {progress.for(item.id)?.isFinished
                ? t('list.finished')
                : fraction > 0
                  ? t('list.inProgress')
                  : ''}
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
    {/if}
</div>

<style>
  .toolbar {
    display: flex;
    align-items: center;
    gap: var(--gap-row);
    padding: var(--gap-inline) var(--gap-block);
    border-bottom: 1px solid var(--hairline);
    background: var(--surface);
  }

  /* The library name truncates on its own; the count must never wrap into a
     second line ("书库共 41" / "本") when the row gets tight. */
  .toolbar__left {
    display: flex;
    align-items: center;
    gap: var(--gap-inline);
    flex: 0 0 auto;
    min-width: 0;
    white-space: nowrap;
  }

  .toolbar__left .t-num {
    flex: 0 0 auto;
    white-space: nowrap;
  }

  .toolbar__sep {
    width: 1px;
    height: 20px;
    margin-inline: 2px;
    background: var(--hairline);
  }

  /* Narrow windows drop the least important controls instead of crushing the
     selects into a single letter that overlaps the search field. */
  @media (max-width: 1160px) {
    .toolbar__right .toolbar__sep,
    .found { display: none; }
  }

  @media (max-width: 940px) {
    .toolbar__left .t-num { display: none; }
  }

  /* ── Home: history on the left, one category switch on the right ────────── */

  .home {
    display: grid;
    grid-template-columns: clamp(264px, 25%, 336px) minmax(0, 1fr);
    gap: var(--gap-section);
    align-items: stretch;
    flex: 1 1 auto;
    min-height: 0;
    overflow: hidden;
    padding: var(--gap-block) var(--gap-block) var(--gap-panel);
  }

  /* The left column owns the full height of the window. Resizing no longer
     leaves a blank gap under the history card; if the queue grows past the
     space, the card scrolls inside itself instead of pushing the page. */
  .home__side {
    display: flex;
    flex-direction: column;
    min-width: 0;
    min-height: 0;
  }

  .home__panel {
    display: flex;
    flex-direction: column;
    flex: 1 1 auto;
    min-height: 0;
    overflow-y: auto;
    overscroll-behavior: contain;
    padding: var(--gap-row);
    border-radius: var(--radius-md);
    border: 1px solid var(--hairline);
    background: var(--surface);
  }

  .panel__head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--gap-inline);
    margin-bottom: var(--gap-row);
  }

  .home__main {
    display: flex;
    flex-direction: column;
    gap: var(--gap-block);
    min-width: 0;
    min-height: 0;
    overflow-y: auto;
    overscroll-behavior: contain;
    padding-right: 4px;
  }

  /* Three grid tracks: an empty one, the switch on the centre line, and
     "view all" at the right edge. Two equal 1fr tracks keep the switch
     centred no matter how wide the shelf gets. */
  .home__bar {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
    align-items: center;
    gap: var(--gap-row);
    position: sticky;
    top: 0;
    z-index: 2;
    padding-bottom: var(--gap-inline);
    background: var(--canvas);
  }

  .home__spacer {
    min-width: 0;
  }

  .home__bar :global(.home-tabs) {
    justify-self: center;
  }

  .home__all {
    justify-self: end;
  }

  .home-tabs {
    display: flex;
    flex-wrap: wrap;
    gap: 2px;
    padding: 3px;
    border-radius: var(--radius-pill);
    background: var(--surface-inset);
    border: 1px solid var(--hairline);
  }

  .home-tabs__item {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 5px 13px;
    border-radius: var(--radius-pill);
    font-size: var(--text-xs);
    color: var(--text-secondary);
  }

  .home-tabs__item:hover {
    color: var(--text);
  }

  .home-tabs__item[aria-pressed='true'] {
    background: var(--accent);
    color: var(--on-accent);
    font-weight: var(--weight-medium);
  }

  .home-tabs__count {
    font-size: var(--text-2xs);
    opacity: 0.72;
  }

  .hero {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: var(--gap-row);
    border-radius: var(--radius-sm);
    background: linear-gradient(140deg, var(--accent-soft), var(--surface-raised));
  }

  .hero__top {
    display: flex;
    gap: var(--gap-row);
    min-width: 0;
  }

  .hero__cover {
    width: 84px;
    flex: 0 0 84px;
    aspect-ratio: 1;
    border-radius: var(--radius-xs);
    overflow: hidden;
    box-shadow: var(--shadow-1);
  }

  .hero__body {
    display: flex;
    flex: 1 1 auto;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }

  .hero__tag {
    font-size: var(--text-2xs);
    letter-spacing: 0.04em;
    color: var(--accent);
  }

  .hero__title {
    font-size: var(--text-sm);
    font-weight: var(--weight-semibold);
    line-height: 1.3;
  }

  .hero__bar {
    height: 4px;
    border-radius: var(--radius-pill);
    background: var(--surface-inset);
    overflow: hidden;
  }

  .hero__bar > span {
    display: block;
    height: 100%;
    background: var(--accent);
  }

  .hero__foot {
    display: flex;
    justify-content: space-between;
    gap: var(--gap-inline);
  }

  .hero__actions {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }

  .home-groups {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(216px, 1fr));
    gap: var(--gap-inline);
  }

  .home-group {
    display: flex;
    align-items: center;
    gap: var(--gap-inline);
    padding: var(--gap-inline);
    border-radius: var(--radius-sm);
    border: 1px solid var(--hairline);
    background: var(--surface);
    text-align: left;
    color: var(--text-tertiary);
  }

  .home-group:hover {
    background: var(--surface-raised);
    border-color: var(--accent-line);
    color: var(--accent);
  }

  .home-group__cover {
    width: 38px;
    height: 38px;
    flex: 0 0 38px;
    border-radius: var(--radius-xs);
    overflow: hidden;
  }

  .home-group__text {
    display: flex;
    flex: 1 1 auto;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
    font-size: var(--text-sm);
    color: var(--text);
  }

  /* Below this the two columns cannot both stay readable, so the history card
     moves above the switch instead of being crushed to 200 px. */
  @media (max-width: 1080px) {
    /* One column: give scrolling back to the page, so neither panel is
       squeezed into half a viewport. */
    .page.page--home {
      display: block;
      overflow-y: auto;
      padding: var(--gap-block);
    }
    .home {
      grid-template-columns: minmax(0, 1fr);
      overflow: visible;
      padding: 0;
    }
    .home__panel,
    .home__main {
      overflow: visible;
    }
  }

  .home__empty {
    padding: var(--gap-panel) 0;
  }

  .queue {
    display: flex;
    flex-direction: column;
    gap: 2px;
    margin-top: var(--gap-row);
    padding-top: var(--gap-row);
    border-top: 1px solid var(--hairline);
  }

  .queue__row {
    display: flex;
    align-items: center;
    gap: var(--gap-inline);
    padding: 5px;
    border-radius: var(--radius-sm);
    text-align: left;
  }

  .queue__row:hover {
    background: var(--surface-raised);
  }

  .queue__cover {
    width: 32px;
    height: 32px;
    flex: 0 0 32px;
    border-radius: var(--radius-xs);
    overflow: hidden;
  }

  .queue__text {
    display: flex;
    flex: 1 1 auto;
    flex-direction: column;
    gap: 1px;
    min-width: 0;
    font-size: var(--text-sm);
  }

  @media (max-width: 900px) {
    .hero {
      gap: 6px;
      padding: var(--gap-inline);
    }
    .hero__cover {
      width: 72px;
      flex-basis: 72px;
    }
  }

  .home-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(148px, 1fr));
    gap: var(--gap-block) var(--gap-panel);
  }

  .toolbar__right {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 6px;
    flex: 0 0 auto;
    min-width: 0;
  }

  .found {
    white-space: nowrap;
  }

  .search {
    position: relative;
    flex: 1 1 320px;
    min-width: 150px;
    max-width: 420px;
    margin-inline: auto;
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

  .segmented--tools .segmented__item {
    display: grid;
    place-items: center;
    padding-inline: 9px;
  }

  .page {
    position: relative;
    flex: 1 1 auto;
    min-height: 0;
    padding: var(--gap-block);
  }

  /* Home is its own viewport: the page must not scroll, or the history card
     on the left drifts away while the shelf on the right is being read. */
  .page.page--home {
    display: flex;
    flex-direction: column;
    overflow: hidden;
    padding: 0;
  }

  /* Title on the left, view switch on the right. Centred stacking made a
     four-item pill stretch across the page and read as a toolbar of its own. */
  .viewbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--gap-row);
    flex-wrap: wrap;
    padding-bottom: var(--gap-row);
    margin-bottom: var(--gap-block);
    border-bottom: 1px solid var(--hairline);
  }

  .viewbar__head {
    display: flex;
    align-items: baseline;
    gap: var(--gap-inline);
    min-width: 0;
  }

  .viewbar__title {
    font-size: var(--text-xl);
    font-weight: var(--weight-semibold);
    letter-spacing: -0.01em;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .viewbar__count {
    flex: 0 0 auto;
    white-space: nowrap;
  }

  /* Active view gets a solid accent pill: a grey underline was invisible. */
  .viewbar :global(.segmented--views) {
    flex: 0 0 auto;
    gap: 2px;
    padding: 3px;
    background: var(--surface-inset);
    border: 1px solid var(--hairline);
  }

  .viewbar :global(.segmented__item) {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 5px 14px;
    font-size: var(--text-sm);
    color: var(--text-secondary);
  }

  .viewbar :global(.segmented__item[aria-pressed='true']) {
    background: var(--accent);
    color: var(--on-accent);
    font-weight: var(--weight-medium);
    box-shadow: 0 1px 4px rgb(0 0 0 / 0.14);
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
    grid-template-columns: 44px minmax(0, 1fr) 84px 140px 82px;
    align-items: center;
    gap: var(--gap-row);
    padding: 8px var(--gap-row);
    border-radius: var(--radius-sm);
    border: 1px solid transparent;
    text-align: left;
  }

  .list__row:nth-child(odd) {
    background: var(--surface);
  }

  .list__row:hover,
  .list__row[aria-current='true'] {
    background: var(--surface-raised);
    border-color: var(--accent-line);
  }

  .list__tag {
    justify-self: start;
    padding: 2px 8px;
    border-radius: var(--radius-pill);
    font-size: var(--text-2xs);
    color: var(--text-tertiary);
  }

  .list__tag.on {
    background: var(--accent-soft);
    color: var(--accent);
  }

  .list__tag.done {
    background: var(--surface-inset);
    color: var(--text-secondary);
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

  .list__extra {
    font-size: var(--text-2xs);
    opacity: 0.8;
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

  /* Grid: cover-forward cards. List: one row per group with a share bar. The
     two shapes are deliberately far apart so the toolbar toggle is never
     ambiguous. */
  .groups {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(196px, 1fr));
    gap: var(--gap-row);
    margin-bottom: var(--gap-section);
  }

  .groups--list {
    grid-template-columns: minmax(0, 1fr);
    gap: 2px;
  }

  .group {
    display: flex;
    flex-direction: column;
    gap: var(--gap-inline);
    padding: var(--gap-inline);
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
    width: 100%;
    aspect-ratio: 1;
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

  .group__share {
    display: none;
  }

  .groups--list .group {
    flex-direction: row;
    align-items: center;
    gap: var(--gap-row);
    padding: 6px var(--gap-row);
    border-color: transparent;
  }

  .groups--list .group:nth-child(odd) {
    background: var(--surface-inset);
  }

  .groups--list .group__cover {
    width: 40px;
    height: 40px;
    aspect-ratio: auto;
    flex: 0 0 40px;
  }

  .groups--list .group__text {
    flex: 1 1 auto;
  }

  .groups--list .group__share {
    display: block;
    width: 128px;
    height: 3px;
    flex: 0 0 128px;
    border-radius: var(--radius-pill);
    background: var(--surface-inset);
    overflow: hidden;
  }

  .groups--list .group__share > span {
    display: block;
    height: 100%;
    background: var(--accent-line);
  }

  .groups--list .group:hover .group__share > span {
    background: var(--accent);
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
