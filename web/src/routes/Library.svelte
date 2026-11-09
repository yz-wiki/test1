<script lang="ts">
  import { onMount } from 'svelte';
  import { listen } from '@tauri-apps/api/event';
  import { library, progress, session, ui } from '../lib/state.svelte';
  import { player } from '../lib/player.svelte';
  import { playItem } from '../lib/playFlow';
  import { matchScore, normalizeQuery, textMatches } from '../lib/search';
  import { reading } from '../lib/reading.svelte';
  import { menu, type MenuItem } from '../lib/menu.svelte';
  import { beginDownload } from '../lib/downloadFlow';
  import { downloads } from '../lib/downloads.svelte';
  import { updateProgress } from '../lib/ipc';
  import { t, formatLength, type TranslationKey } from '../lib/i18n.svelte';
  import Icon from '../components/Icon.svelte';
  import Cover from '../components/Cover.svelte';
  import HoverCard from '../components/HoverCard.svelte';
  import { artwork, type ArtKind } from '../lib/artwork.svelte';

  // Reload whenever the active library or server changes.
  $effect(() => {
    void library.load(session.serverUrl, session.activeLibraryId);
  });

  /**
   * The ABS socket already forwards item_added / item_updated / item_removed.
   * Listening to them here makes the shelf self-refreshing, so the manual
   * refresh button is no longer needed: server changes land while the window
   * is open, and a short debounce collapses a batch (a rescan emits dozens).
   */
  onMount(() => {
    let offs: (() => void)[] = [];
    let timer: ReturnType<typeof setTimeout> | null = null;
    const reload = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(
        () => void library.load(session.serverUrl, session.activeLibraryId, true),
        250,
      );
    };
    void Promise.all(
      ['library-item-added', 'library-item-updated', 'library-item-removed'].map(name =>
        listen(name, reload),
      ),
    ).then(fns => (offs = fns));
    return () => {
      if (timer) clearTimeout(timer);
      offs.forEach(off => off());
    };
  });

  /** The title bar owns the input, the filter, the sort and the layout switch;
      this page only reads the shared values. Nothing here resets when a route
      change unmounts the shelf, which is what made two pages rank a query
      differently. */
  const query = $derived(ui.query);
  const sort = $derived(ui.librarySort);
  const filter = $derived(ui.libraryFilter);

  type View = 'home' | 'books' | 'series' | 'authors' | 'narrators';

  /** The sidebar owns the view now; the page switcher is a second way in. */
  const view = $derived(ui.libraryView as View);
  /** Group drill-down lives in the global store so Esc and the rail's back
      button can unwind it without reaching into this component. */
  const group = $derived(ui.focusGroup?.name ?? null);

  const GROUPED = $derived(view === 'series' || view === 'authors' || view === 'narrators');
  /** Home is a dashboard, not a 60-item grid with a shelf stapled on top.
      A query no longer kicks the user out to the books route: the right-hand
      shelf becomes the result list while the history rail stays put. */
  const isHome = $derived(view === 'home');

  function setView(next: View): void {
    ui.setLibraryView(next);
    ui.focusGroup = null;
    resetScroll();
  }

  /** Switch the category shown on the dashboard without ever leaving it. */
  function selectHomeTab(next: (typeof homeTabs)[number]['id']): void {
    ui.focusGroup = null;
    homeTab = next;
    resetScroll();
  }

  /**
   * ABS frequently stores each volume as its own series ("盗墓笔记 #1",
   * "盗墓笔记 #2" …), which produced a wall of groups containing exactly one
   * book. Strip a trailing volume marker so a shelf of #1–#8 reads as one
   * series of eight books. The original name still appears on the book tile.
   */
  function seriesGroup(name: string): string {
    const trimmed = name.trim();
    return (
      trimmed
        .replace(/\s*[#＃]\s*\d+(?:\.\d+)?\s*$/, '')
        .replace(/\s*[（(]\s*\d+\s*[)）]\s*$/, '')
        .replace(/\s*第\s*\d+\s*[部卷册集篇]\s*$/, '')
        .trim() || trimmed
    );
  }

  function keyOf(item: (typeof library.items)[number], by: View): string {
    const meta = item.media?.metadata;
    if (by === 'series') return seriesGroup(seriesOf(item));
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
      .map(([name, items]) => {
        const author =
          items.find(item => item.media?.metadata?.authorName?.trim())?.media?.metadata?.authorName?.trim() ?? '';
        const total = items.reduce((sum, item) => sum + (item.media?.duration ?? 0), 0);
        const listened = items.length
          ? items.reduce((sum, item) => sum + progress.fraction(item.id), 0) / items.length
          : 0;
        const finished = items.filter(item => progress.for(item.id)?.isFinished).length;
        return { name, items, author, total, listened, finished };
      })
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
    void ui.pinyinReady;
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
      return hits.sort((a, b) => {
        const delta = (scored.get(b.id) ?? 0) - (scored.get(a.id) ?? 0);
        if (delta) return delta;
        // Equal relevance: an in-progress book beats an untouched one, then
        // a stable title order. Search results must not shuffle on every key.
        const live = (id: string) => Number(Boolean(progress.for(id) && !progress.for(id)?.isFinished));
        return live(b.id) - live(a.id) || title(a).localeCompare(title(b), 'zh-CN');
      });
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
   * The home shelf shows EVERY book, not a 12-item teaser. It honours the same
   * filter/sort state as the library page, so switching to list layout keeps
   * the ordering instead of silently resetting to "recently added".
   */
  const homeBooks = $derived.by(() => {
    let list = [...library.items];
    if (filter === 'finished') {
      list = list.filter(item => progress.for(item.id)?.isFinished === true);
    } else if (filter === 'unfinished') {
      list = list.filter(item => progress.for(item.id)?.isFinished !== true);
    }
    if (sort === 'title') list.sort((a, b) => title(a).localeCompare(title(b), 'zh-CN'));
    else if (sort === 'author') list.sort((a, b) => author(a).localeCompare(author(b), 'zh-CN'));
    else if (sort === 'progress') list.sort((a, b) => progress.fraction(b.id) - progress.fraction(a.id));
    else list.sort((a, b) => (b.addedAt ?? 0) - (a.addedAt ?? 0));
    return list;
  });

  /** Books inside the group opened on the dashboard. The same series /
      author / narrator key that built the group card is used here, so the
      count on the card always matches the shelf that opens. */
  const focusBooks = $derived.by(() => {
    const focus = ui.focusGroup;
    if (!focus) return [] as typeof library.items;
    return library.items
      .filter(item => keyOf(item, focus.tab) === focus.name)
      .sort((a, b) => title(a).localeCompare(title(b), 'zh-CN'));
  });

  /** One source for the right-hand shelf: a query turns the dashboard into a
      result list in place, otherwise an opened group or the category shelf. */
  const shelfItems = $derived(
    query.trim() ? visible : ui.focusGroup ? focusBooks : homeBooks,
  );

  /** Largest home group, so the list shape can draw a comparable share bar. */
  const maxHomeGroupSize = $derived(
    homeGroups.reduce((max, entry) => Math.max(max, entry.items.length), 1),
  );

  /**
   * One search story for the dashboard and the library shelves: the same
   * ranked book list, plus the series / author / narrator names that matched.
   * A name opens its books in place — no route jump, no second query — so Esc
   * and the rail's back button unwind it like any other group.
   */
  type FacetTab = 'series' | 'authors' | 'narrators';
  const FACETS: { tab: FacetTab; key: TranslationKey }[] = [
    { tab: 'series', key: 'search.groupSeries' },
    { tab: 'authors', key: 'search.groupAuthors' },
    { tab: 'narrators', key: 'search.groupNarrators' },
  ];

  const facets = $derived.by(() => {
    const words = normalizeQuery(query).toLowerCase().split(/\s+/).filter(Boolean);
    if (words.length === 0) return [] as { tab: FacetTab; key: TranslationKey; names: string[] }[];
    const found = new Map<FacetTab, Set<string>>(FACETS.map(entry => [entry.tab, new Set<string>()]));
    for (const item of library.items) {
      const names: [FacetTab, string][] = [
        ['series', seriesGroup(seriesOf(item))],
        ['authors', author(item)],
        ['narrators', item.media?.metadata?.narratorName?.trim() ?? ''],
      ];
      for (const [tab, name] of names) {
        // AND across words, exactly like matchScore does for books.
        if (name && words.every(word => textMatches(name, word))) found.get(tab)?.add(name);
      }
    }
    return FACETS.map(entry => ({
      tab: entry.tab,
      key: entry.key,
      names: [...(found.get(entry.tab) ?? [])]
        .sort((a, b) => a.length - b.length || a.localeCompare(b, 'zh-CN'))
        .slice(0, 8),
    }));
  });

  /** Empty facet rows are noise: a query for a title rarely names a narrator. */
  const activeFacets = $derived(facets.filter(entry => entry.names.length > 0));

  function focusFacet(tab: FacetTab, name: string): void {
    ui.query = '';
    if (!isHome) setView(tab);
    ui.focusGroup = { tab, name };
    resetScroll();
  }

  /** Local artwork is a client-side override; feedback stays in this page. */
  let artNotice = $state<string | null>(null);
  let artTimer: ReturnType<typeof setTimeout> | null = null;

  async function pickArtwork(kind: ArtKind, id: string): Promise<void> {
    const result = await artwork.choose(kind, id);
    const message = result === 'ok' ? t('art.saved') : result === 'error' ? t('art.failed') : null;
    if (!message) return;
    artNotice = message;
    if (artTimer) clearTimeout(artTimer);
    artTimer = setTimeout(() => (artNotice = null), 2200);
  }

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

  let scroller = $state<HTMLDivElement | null>(null);
  /** On a wide dashboard the shelf, not the page, owns the scrollbar. */
  let homeMainEl = $state<HTMLElement | null>(null);
  let gridEl = $state<HTMLDivElement | null>(null);

  /** Both panes must go back to the top when the view or the query changes. */
  function resetScroll(): void {
    if (scroller) scroller.scrollTop = 0;
    if (homeMainEl) homeMainEl.scrollTop = 0;
  }
  let scrollTop = $state(0);
  let viewportH = $state(0);
  let gridWidth = $state(0);
  let gridTop = $state(0);

  const isList = $derived(ui.libraryLayout === 'list');
  const isCompact = $derived(ui.libraryLayout === 'compact');
  /** Virtualisation belongs to the cover grid only; small cards are cheap
      enough to render in one pass and need no absolute-position slice. */
  const windowed = $derived(!isList && !isCompact && visible.length > THRESHOLD);
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

  // ─── Continue-listening queue: capacity follows the WINDOW ──────────────
  // Stretching a few rows across a tall panel left one book floating in the
  // middle of a blank slab. Instead the rail is measured and only whole rows
  // that actually fit are rendered, so growing the window reveals more of the
  // history and shrinking it drops the oldest entries. The queue itself keeps
  // a fixed flex height, so hiding rows cannot feed back into the measurement.
  const QUEUE_MAX = 5;
  const QUEUE_ROW_H = 60;
  const QUEUE_GAP = 2;
  let sideEl = $state<HTMLElement | null>(null);
  let queueLimit = $state(QUEUE_MAX);

  $effect(() => {
    const side = sideEl;
    if (!side || typeof ResizeObserver === 'undefined') return;
    let last = -1;
    const measure = () => {
      // Under 1080px the panel becomes a two-column grid; CSS owns the row
      // count there and all five rows fit without a height budget.
      if (window.innerWidth <= 1080) {
        if (last !== QUEUE_MAX) { last = QUEUE_MAX; queueLimit = QUEUE_MAX; }
        return;
      }
      const queue = side.querySelector<HTMLElement>('.queue');
      if (!queue) return;
      const style = getComputedStyle(queue);
      // clientHeight already excludes borders, only padding is still inside.
      const inset =
        (parseFloat(style.paddingTop) || 0) + (parseFloat(style.paddingBottom) || 0);
      const row = queue.querySelector<HTMLElement>('.queue__row');
      const rowH = row?.getBoundingClientRect().height || QUEUE_ROW_H;
      const available = queue.clientHeight - inset;
      const next = Math.max(
        0,
        Math.min(QUEUE_MAX, Math.floor((available + QUEUE_GAP) / (rowH + QUEUE_GAP))),
      );
      if (next !== last) { last = next; queueLimit = next; }
    };
    const observer = new ResizeObserver(measure);
    observer.observe(side);
    measure();
    return () => observer.disconnect();
  });

  function onScroll(event: Event): void {
    scrollTop = (event.currentTarget as HTMLElement).scrollTop;
  }

  // Focus is handled by the title bar now — that component is mounted on
  // every route, so Ctrl+F also works from settings or a book detail page.
  $effect(() => {
    void query;
    void ui.libraryView;
    if ((scroller?.scrollTop ?? 0) > 0 || (homeMainEl?.scrollTop ?? 0) > 0) {
      resetScroll();
    }
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
        // A permanently greyed-out "Delete" read as a broken button. ABS has
        // no safe "delete this book" action for a player, so the only real
        // deletion here is the local download — and it is simply absent when
        // there is nothing downloaded, rather than shown disabled.
        {
          id: 'finished',
          label: finished ? t('menu.markUnfinished') : t('menu.markFinished'),
          separatorBefore: true,
          action: () => void markFinished(item, !finished),
        },
      );
      if (downloaded) {
        items.push({
          id: 'remove',
          label: t('menu.removeLocal'),
          danger: true,
          action: () => void downloads.remove(item.id),
        });
      }
    }

    const authorName = item.media?.metadata?.authorName?.trim() ?? '';
    const seriesName = seriesOf(item);
    const artItems: MenuItem[] = [
      { id: 'artCover', label: t('art.setCover'), separatorBefore: true,
        action: () => void pickArtwork('book', item.id) },
    ];
    if (authorName) {
      artItems.push({ id: 'artAuthor', label: t('art.setAuthorArt'),
        action: () => void pickArtwork('author', authorName) });
    }
    if (seriesName) {
      artItems.push({ id: 'artSeries', label: t('art.setSeriesArt'),
        action: () => void pickArtwork('series', seriesName) });
    }
    if (artwork.has('book', item.id)) {
      artItems.push({ id: 'artRestore', label: t('art.restore'),
        action: () => artwork.clear('book', item.id) });
    }
    items.push(...artItems);

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

<!-- One tile shape for every book shelf on the dashboard, whether it is the
     full shelf or a series / author / narrator opened in place. -->
{#snippet bookTile(item: (typeof library.items)[number])}
  {@const fraction = progress.fraction(item.id)}
  <button
    class="tile"
    onclick={() => open(item)}
    oncontextmenu={event => openMenu(event, item)}
  >
    <Cover itemId={item.id} size={320} title={title(item)} />
    <span class="tile__body">
      <span class="tile__title">{title(item)}</span>
      {#if isCompact}
        <span class="tile__meta truncate">
          {[seriesOf(item), author(item)].filter(Boolean).join(' · ') || t('common.unknown')}
        </span>
        <span class="tile__extra t-small t-tertiary truncate">
          {[fraction > 0 ? `${Math.round(fraction * 100)}%` : '', currentChapter(item)]
            .filter(Boolean).join(' · ') || formatLength(item.media?.duration ?? 0)}
        </span>
      {:else}
        <span class="tile__meta">
          {[seriesOf(item), author(item), ago(item.addedAt)].filter(Boolean).join(' · ')}
        </span>
        <span class="tile__extra t-small t-tertiary truncate">
          {[currentChapter(item), item.media?.metadata?.narratorName, formatLength(item.media?.duration ?? 0)]
            .filter(Boolean).join(' · ')}
        </span>
      {/if}
    </span>
    {#if fraction > 0}
      <span class="tile__badge t-num" class:done={progress.for(item.id)?.isFinished}>
        {Math.round(fraction * 100)}%
      </span>
    {/if}
    {#if artwork.has('book', item.id)}
      <span class="tile__local">{t('brand.localOnly')}</span>
    {/if}
  </button>
{/snippet}

<!-- One facet strip for both the dashboard and the library shelves: the same
     ranked query, the same names, the same in-place drill-down. -->
{#snippet facetChips()}
  {#if activeFacets.length > 0}
    <div class="search-groups">
      {#each activeFacets as facet (facet.tab)}
        <div class="search-groups__row">
          <span class="search-groups__label t-label">{t(facet.key)}</span>
          {#each facet.names as name (name)}
            <button class="search-groups__chip" onclick={() => focusFacet(facet.tab, name)}>
              {name}
            </button>
          {/each}
        </div>
      {/each}
      <p class="search-groups__hint t-small t-tertiary">{t('search.groupHint')}</p>
    </div>
  {/if}
{/snippet}

<!-- Library-wide filter / sort / layout / refresh now live in the title bar
     on the same line as the global search field. The page keeps only the
     shelf-level category switch and the results themselves. -->

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
      <div class="home" class:home--search={Boolean(normalizeQuery(query))}>
        <aside class="home__side" data-hover-boundary bind:this={sideEl}>
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
                  <button
                    class="btn btn--primary btn--sm"
                    disabled={player.loading && player.item?.id === top.id}
                    onclick={() => resume(top)}
                  >
                    {#if player.loading && player.item?.id === top.id}
                      <span class="hero__spin" aria-hidden="true"></span>
                      {t('player.opening')}
                    {:else}
                      <Icon name="play" size={13} /> {t('home.resume')}
                    {/if}
                  </button>
                  <button class="btn btn--quiet btn--sm" onclick={() => open(top)}>{t('home.details')}</button>
                </div>
              </div>

              {#if recent.length > 1}
                <div class="queue" class:queue--empty={queueLimit === 0}>
                  {#each recent.slice(1, 1 + queueLimit) as item (item.id)}
                    {@const fraction = progress.fraction(item.id)}
                    <HoverCard>
                      {#snippet children(isOpen)}
                        <button
                          class="queue__row hl"
                          class:selected={isOpen}
                          onclick={() => resume(item)}
                          oncontextmenu={event => openMenu(event, item)}
                        >
                          <span class="queue__cover"><Cover itemId={item.id} size={96} title={title(item)} /></span>
                          <span class="queue__text">
                            <span class="truncate">{title(item)}</span>
                            <span class="t-small t-tertiary truncate">{currentChapter(item) || author(item)}</span>
                          </span>
                          <span class="t-num t-small t-tertiary">{Math.round(fraction * 100)}%</span>
                        </button>
                      {/snippet}
                      {#snippet pop()}
                        <div class="hover-info">
                          <div class="hover-info__head">
                            <span class="hover-info__cover"><Cover itemId={item.id} size={120} title={title(item)} /></span>
                            <span class="hover-info__id">
                              <strong class="truncate">{title(item)}</strong>
                              <span class="t-small t-tertiary truncate">{author(item)}</span>
                            </span>
                          </div>
                          {#if currentChapter(item)}
                            <p class="hover-info__line">
                              <span class="hover-info__key">{t('continue.hoverChapter')}</span>
                              <span class="truncate">{currentChapter(item)}</span>
                            </p>
                          {/if}
                          {#if item.media?.metadata?.description}
                            <p class="hover-info__desc">{item.media.metadata.description}</p>
                          {/if}
                          <div class="hover-info__foot t-num t-small t-tertiary">
                            <span>{formatLength((item.media?.duration ?? 0) * fraction)} / {formatLength(item.media?.duration ?? 0)}</span>
                            <span>{Math.round(fraction * 100)}%</span>
                          </div>
                          <span class="hover-info__bar" aria-hidden="true"><span style:width="{fraction * 100}%"></span></span>
                        </div>
                      {/snippet}
                    </HoverCard>
                  {/each}
                </div>
              {/if}
            {:else}
              <p class="t-small t-tertiary home__empty">{t('continue.empty')}</p>
            {/if}
          </section>
        </aside>

        <section class="home__main" bind:this={homeMainEl}>
          <!-- The category tabs moved up to the toolbar row. What remains is
               the shelf's own heading, or a breadcrumb when a group is open
               in place — the dashboard never navigates away. -->
          <div class="home__bar">
            <div class="home__bar-lead">
              {#if query.trim()}
                <span class="home__bar-title t-label t-num">{t('library.found', { count: visible.length })}</span>
              {:else if ui.focusGroup}
                {@const focus = ui.focusGroup}
                <button class="btn btn--quiet btn--sm home__back" onclick={() => (ui.focusGroup = null)}>
                  <Icon name="arrow-left" size={13} /> {t('nav.back')}
                </button>
                <span class="home__bar-title truncate">
                  {focus.name}
                  <span class="t-small t-tertiary t-num">· {t('library.count', { count: focusBooks.length })}</span>
                </span>
              {:else}
                <span class="home__bar-title t-label">
                  {t(homeTabs.find(entry => entry.id === homeTab)?.key ?? 'library.books')}
                </span>
              {/if}
            </div>

            <!-- The category switch belongs to the shelf it filters, centred
                 above the right-hand display rather than in the top toolbar. -->
            {#if !query.trim()}
              <div class="shelf-tabs" role="group" aria-label={t('home.categories')}>
                {#each homeTabs as entry (entry.id)}
                  <button
                    class="shelf-tabs__item"
                    aria-pressed={isHome ? homeTab === entry.id : view === entry.id}
                    onclick={() => (isHome ? selectHomeTab(entry.id) : setView(entry.id))}
                  >
                    {t(entry.key)}
                    <span class="shelf-tabs__count t-num">{entry.count}</span>
                  </button>
                {/each}
              </div>
            {:else}
              <span aria-hidden="true"></span>
            {/if}

            <div class="home__bar-trail">
              {#if !ui.focusGroup && !query.trim()}
                <button class="btn btn--quiet btn--sm home__all" onclick={() => setView(homeTab)}>
                  {t('home.viewAll')} <Icon name="chevron-right" size={12} />
                </button>
              {/if}
            </div>
          </div>

          {#if query.trim()}
            {@render facetChips()}
          {/if}

          {#if query.trim() || ui.focusGroup || homeTab === 'books'}
            <div
              class="home-grid"
              class:home-grid--list={isList}
              class:home-grid--compact={isCompact}
            >
              {#each shelfItems as item (item.id)}
                {@render bookTile(item)}
              {/each}
              {#if query.trim() && visible.length === 0}
                <p class="t-small t-tertiary home__empty">{t('library.empty')}</p>
              {/if}
            </div>
          {:else}
            <!-- The "long bar grid" and the "long tag" in the screenshots are
                 one and the same list in its grid / list layout. Author and
                 series cards address local artwork by NAME, which is the only
                 stable key ABS gives us for them. -->
            <div
              class="home-groups"
              class:home-groups--list={isList}
              class:home-groups--compact={isCompact}
            >
              {#each homeGroups as entry (entry.name)}
                {@const kind: ArtKind = homeTab === 'authors' ? 'author' : homeTab === 'series' ? 'series' : 'book'}
                <button
                  class="home-group"
                  onclick={() => (ui.focusGroup = { tab: homeTab, name: entry.name })}
                  oncontextmenu={event => menu.show(event, [
                    {
                      id: 'artGroup',
                      label: kind === 'author' ? t('art.setAuthorArt') : kind === 'series' ? t('art.setSeriesArt') : t('art.setCover'),
                      action: () => void pickArtwork(kind, entry.name),
                    },
                    ...(artwork.has(kind, entry.name)
                      ? [{ id: 'artGroupRestore', label: t('art.restore'), action: () => artwork.clear(kind, entry.name) }]
                      : []),
                  ])}
                >
                  <span class="home-group__cover">
                    <Cover itemId={entry.items[0].id} size={320} title={entry.name} artKind={kind} artId={entry.name} />
                  </span>
                  <span class="home-group__text">
                    <span class="truncate">{entry.name}</span>
                    <span class="t-small t-tertiary t-num">
                      {t('library.count', { count: entry.items.length })}
                    </span>
                  </span>
                  <span class="home-group__share" aria-hidden="true">
                    <span style:width="{Math.round((entry.items.length / maxHomeGroupSize) * 100)}%"></span>
                  </span>
                  {#if artwork.has(kind, entry.name)}
                    <span class="home-group__local">{t('brand.localOnly')}</span>
                  {/if}
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
        {#if group}
          <button class="btn btn--quiet btn--sm" onclick={() => (ui.focusGroup = null)}>
            <Icon name="arrow-left" size={13} /> {t('nav.back')}
          </button>
          <span class="viewbar__title truncate">{group}</span>
        {/if}
      </div>

      <!-- The same centred category switch on every shelf. The old left-hand
           "书籍 / 系列" heading duplicated it and pushed the pills off centre. -->
      <div class="shelf-tabs" role="group" aria-label={t('home.categories')}>
        {#each homeTabs as entry (entry.id)}
          <button
            class="shelf-tabs__item"
            aria-pressed={view === entry.id}
            onclick={() => setView(entry.id)}
          >
            {t(entry.key)}
            <span class="shelf-tabs__count t-num">{entry.count}</span>
          </button>
        {/each}
      </div>

      <span class="viewbar__count t-small t-tertiary t-num">
        {t('library.count', { count: visible.length })}
      </span>
    </div>

    {#if query.trim() && !group}
      {@render facetChips()}
      <div class="search-groups__head t-label">
        {t('search.groupBooks')}
        <span class="t-num">{t('home.showing', { count: visible.length })}</span>
      </div>
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
        <div
          class="groups"
          class:groups--list={isList}
          class:groups--compact={isCompact}
        >
          {#each groups as entry (entry.name)}
            {@const kind: ArtKind = view === 'authors' ? 'author' : view === 'series' ? 'series' : 'book'}
            <button class="group" onclick={() => (ui.focusGroup = { tab: view, name: entry.name })}>
              <span class="group__cover">
                <Cover
                  itemId={entry.items[0].id}
                  size={240}
                  title={entry.name}
                  artKind={kind}
                  artId={entry.name}
                />
                <span class="group__badge t-num">{t('library.count', { count: entry.items.length })}</span>
              </span>
              <span class="group__text">
                <span class="truncate group__name">{entry.name}</span>
                <span class="t-small t-secondary truncate">{entry.author || t('common.unknown')}</span>
                <span class="t-small t-tertiary t-num truncate group__facts">
                  {formatLength(entry.total)}{#if entry.finished > 0} · {t('list.finished')} {entry.finished}{/if}
                </span>
              </span>
              <!-- How much of the group has actually been heard: a series of
                   one book and a series of eight should not look identical. -->
              <span class="group__listened" aria-hidden="true">
                <span style:width="{Math.round(entry.listened * 100)}%"></span>
              </span>
              <!-- The share bar only exists in list mode: it is the one extra
                   fact worth a row that a card has no space for. -->
              <span class="group__share" aria-hidden="true">
                <span style:width="{Math.round((entry.items.length / maxGroupSize) * 100)}%"></span>
              </span>
              <!-- The whole tile is the target: a chevron on its own row was
                   redundant and added a ragged extra line under every card. -->
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
    {:else if isCompact}
      <!-- Compact is a card, not a dense table row: cover on the left, then
           title / author / metadata as three separate lines. Cramming the
           author, series and chapter into one run-on subtitle was what made
           this view unreadable compared with the author shelf beside it. -->
      <div class="mini-grid">
        {#each visible as item (item.id)}
          {@const fraction = progress.fraction(item.id)}
          {@const meta = [
            fraction > 0 ? `${Math.round(fraction * 100)}%` : '',
            currentChapter(item),
          ].filter(Boolean).join(' · ') || formatLength(item.media?.duration ?? 0)}
          {@const byline = [seriesOf(item), author(item)].filter(Boolean).join(' · ') || t('common.unknown')}
          <button
            class="mini-card hl"
            aria-current={player.item?.id === item.id && player.playing ? 'true' : undefined}
            onclick={() => open(item)}
            oncontextmenu={event => openMenu(event, item)}
          >
            <span class="mini-card__cover">
              <Cover itemId={item.id} size={96} title={title(item)} />
            </span>
            <span class="mini-card__text">
              <span class="truncate mini-card__title">{title(item)}</span>
              <span class="t-small t-secondary truncate">{byline}</span>
              <span class="t-small t-tertiary truncate mini-card__meta">{meta}</span>
            </span>
            {#if fraction > 0}
              <span class="mini-card__side">
                <span class="mini-card__pct t-num t-small">{Math.round(fraction * 100)}%</span>
              </span>
            {/if}
          </button>
        {/each}
      </div>
    {:else if isList}
      <div class="list">
        {#each visible as item (item.id)}
          {@const fraction = progress.fraction(item.id)}
          {@const chapter = currentChapter(item)}
          <button
            class="list__row hl"
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

{#if artNotice}
  <div class="art-toast t-small" role="status">{artNotice}</div>
{/if}

<style>
  /* The window chrome owns filter / sort / layout / refresh. What remains on
     this page is the shelf's own category switch. */
  .shelf-tabs {
    display: flex;
    flex: 0 0 auto;
    flex-wrap: wrap;
    gap: 2px;
    padding: 3px;
    border-radius: var(--radius-pill);
    background: var(--surface-inset);
    border: 1px solid var(--hairline);
  }

  .shelf-tabs__item {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 4px 12px;
    border-radius: var(--radius-pill);
    font-size: var(--text-xs);
    white-space: nowrap;
    color: var(--text-secondary);
  }

  .shelf-tabs__item:hover {
    color: var(--text);
  }

  .shelf-tabs__item[aria-pressed='true'] {
    background: var(--accent);
    color: var(--on-accent);
    font-weight: var(--weight-medium);
  }

  .shelf-tabs__count {
    font-size: var(--text-2xs);
    opacity: 0.72;
  }

  /* ── Home: history on the left, one category switch on the right ────────── */

  .home {
    display: grid;
    grid-template-columns: clamp(248px, 24%, 320px) minmax(0, 1fr);
    gap: var(--gap-section);
    /* The listening panel follows the WINDOW, not its own content: stretching
       to the page height is what removes the dead space under it on a tall
       monitor. The queue spreads its rows into the extra height. */
    align-items: stretch;
    min-height: 100%;
    flex: 0 0 auto;
    min-width: 0;
    overflow: visible;
    padding: var(--gap-block) var(--gap-block) var(--gap-panel);
  }

  /* No nested scrollbars in the history card: everything is laid out at its
     natural height and the page itself owns the single scroll. The rail stays
     pinned so the shelf can be read without losing the "continue" list. */
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
    min-width: 0;
    overflow: visible;
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
    overflow: visible;
  }

  /* Three tracks over the shelf: heading / breadcrumb on the left, the
     category switch centred on the shelf's own axis, "view all" at the right.
     Two equal 1fr tracks keep the switch centred regardless of shelf width. */
  .home__bar {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
    align-items: center;
    gap: var(--gap-inline);
    position: sticky;
    top: 0;
    z-index: 3;
    min-width: 0;
    padding: 2px 0 var(--gap-inline);
    background: var(--canvas);
  }

  .home__bar .shelf-tabs {
    justify-self: center;
  }

  .home__bar-lead,
  .home__bar-trail {
    display: flex;
    align-items: center;
    gap: var(--gap-inline);
    min-width: 0;
  }

  .home__bar-lead {
    justify-self: start;
  }

  .home__bar-trail {
    justify-self: end;
  }

  .home__bar-title {
    display: inline-flex;
    align-items: baseline;
    gap: 5px;
    min-width: 0;
    font-size: var(--text-sm);
    font-weight: var(--weight-medium);
    color: var(--text);
  }

  .home__back,
  .home__all {
    flex: 0 0 auto;
  }

  @media (max-width: 900px) {
    .home__bar {
      grid-template-columns: minmax(0, 1fr) auto;
    }
    .home__bar .shelf-tabs {
      grid-column: 1 / -1;
      grid-row: 2;
    }
    .home__bar-trail {
      grid-column: 2;
      grid-row: 1;
    }
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

  /* The click already landed; show it while the stream is negotiated. */
  .hero__spin {
    width: 11px;
    height: 11px;
    flex: 0 0 11px;
    border-radius: 50%;
    border: 1.5px solid rgb(255 255 255 / 0.45);
    border-top-color: var(--on-accent);
    animation: hero-spin 0.7s linear infinite;
  }

  @keyframes hero-spin {
    to { transform: rotate(360deg); }
  }

  .home-groups {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(min(216px, 100%), 1fr));
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
     moves above the shelf. Its shape then follows the WINDOW: with width to
     spare the hero and the queue sit side by side; narrow or short windows
     drop information instead of growing a second scrollbar. */
  @media (max-width: 1080px) {
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
    .home__side {
      position: static;
    }
    .home__panel,
    .home__main {
      overflow: visible;
    }
    .home__panel {
      display: grid;
      grid-template-columns: minmax(220px, 1fr) minmax(0, 1.2fr);
      align-content: start;
      gap: var(--gap-row);
    }
    .panel__head {
      grid-column: 1 / -1;
      margin-bottom: 0;
    }
    .hero {
      grid-column: 1;
      grid-row: 2;
    }
    .queue {
      grid-column: 2;
      grid-row: 2;
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(min(180px, 100%), 1fr));
      align-content: start;
      flex: 0 0 auto;
      min-height: 0;
      overflow: visible;
      margin-top: 0;
      padding-top: 0;
      border-top: 0;
    }
    .home__empty {
      grid-column: 1 / -1;
    }
    /* Results are the point while searching: collapse the queue so the shelf
       is not pushed below the fold on a small window. */
    .home--search .home__panel {
      display: flex;
    }
    .home--search .queue {
      display: none;
    }
  }

  @media (max-width: 760px) {
    .home__panel,
    .home--search .home__panel {
      display: flex;
    }
    .queue {
      display: flex;
      margin-top: var(--gap-row);
      padding-top: var(--gap-row);
      border-top: 1px solid var(--hairline);
    }
  }

  /* The row budget is measured from the rail's real height by the observer
     above, so these rules only trim the hero on short windows and leave more
     of that height to whole queue rows. Hiding rows with nth-child here would
     double-apply the limit and could never recover on a resize. */
  @media (max-height: 760px) {
    .hero__foot { display: none; }
  }

  @media (max-height: 640px) {
    .hero__cover { width: 64px; flex-basis: 64px; }
  }

  .home__empty {
    padding: var(--gap-panel) 0;
  }

  .queue {
    display: flex;
    flex-direction: column;
    justify-content: flex-start;
    gap: 2px;
    margin-top: var(--gap-row);
    padding-top: var(--gap-row);
    border-top: 1px solid var(--hairline);
  }

  /* No rows fit: do not leave a lone divider hanging below the hero. */
  .queue--empty {
    margin-top: 0;
    padding-top: 0;
    border-top-color: transparent;
  }

  /* Every row must own the same box. A button without `width: 100%` is
     shrink-to-fit, so hover / selected / focus rings were drawn around boxes
     of different widths depending on how long the book title happened to be.
     The transparent 1px border matches the compact card's box exactly. */
  .queue__row {
    display: flex;
    align-items: center;
    gap: 10px;
    width: 100%;
    min-width: 0;
    min-height: 60px;
    box-sizing: border-box;
    padding: 7px;
    border: 1px solid transparent;
    border-radius: var(--radius-sm);
    text-align: left;
  }

  /* Hover / selected come from the shared `.hl` vocabulary now, so the
     highlighted row and the open hover card read as one state. A 32px stamp
     made the book title and its chapter look like a tooltip; 44px gives the
     two lines room to breathe without turning the history into a grid. */
  .queue__cover {
    width: 44px;
    height: 44px;
    flex: 0 0 44px;
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

  /* min() keeps a narrow right-hand column from overflowing its track: a
     fixed 148px floor is wider than the whole shelf on a small window. */
  .home-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(min(148px, 100%), 1fr));
    gap: var(--gap-block) var(--gap-panel);
  }

  /* One tree, two declared shapes. The toolbar's grid/list switch used to be
     ignored here because the home shelf had its own hard-coded grid — which is
     exactly why clicking it looked broken. */
  .home-grid .tile {
    position: relative;
  }

  .tile__body {
    display: flex;
    flex-direction: column;
    gap: 3px;
    min-width: 0;
  }

  .tile__extra {
    display: none;
  }

  /* Independent marker: progress and a locally-set cover never masquerade as
     part of the title, and keep the same tint in both layouts. */
  .tile__badge,
  .tile__local {
    position: absolute;
    top: 6px;
    right: 6px;
    padding: 2px 6px;
    border-radius: var(--radius-pill);
    font-size: var(--text-2xs);
    background: var(--surface-overlay);
    border: 1px solid var(--hairline-strong);
    color: var(--text-secondary);
    box-shadow: var(--shadow-1);
  }

  .tile__badge.done {
    color: var(--positive);
    border-color: var(--positive);
  }

  .tile__local {
    top: auto;
    bottom: 6px;
    right: 6px;
    color: var(--accent);
    border-color: var(--accent-line);
  }

  /* ── Compact / small-card layout ──────────────────────────────────────
     The author shelf's card, offered for books too. Cards, not bare cells:
     a surface, a border and real gaps are what make the grid read as a
     collection rather than a spreadsheet. One DOM tree per view still. */
  .mini-grid,
  .home-grid--compact,
  .home-groups--compact,
  .groups--compact {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(min(300px, 100%), 1fr));
    gap: 10px;
    align-content: start;
  }

  .mini-card,
  .home-grid--compact .tile,
  .home-groups--compact .home-group,
  .groups--compact .group {
    display: flex;
    /* `flex-direction` MUST be reset. The grid shapes are columns; without an
       explicit row here the cover stacks above centred text, which is the
       "wrong layout" in the compact view. */
    flex-direction: row;
    justify-content: flex-start;
    align-items: center;
    gap: 12px;
    width: 100%;
    min-width: 0;
    padding: 12px;
    border: 1px solid var(--hairline);
    border-radius: var(--radius-md);
    background: var(--surface-raised);
    text-align: left;
    color: var(--text-secondary);
    transition: background var(--dur-1) var(--ease), border-color var(--dur-1) var(--ease);
  }

  .mini-card:hover,
  .home-grid--compact .tile:hover,
  .home-groups--compact .home-group:hover,
  .groups--compact .group:hover {
    background: var(--surface-raised);
  }

  /* Current / selected styling lives in the shared `.hl` layer, so a queue
     row, a compact card and a dropdown item all share one ring geometry.
     Only the border tint is component-specific. */
  .mini-card[aria-current='true'] {
    border-color: var(--accent-line);
  }

  /* Same 1px geometry as `.hl.selected`'s inset ring, so a focused row and a
     hovered/selected row no longer look like differently sized boxes. */
  .mini-card:focus-visible,
  .queue__row:focus-visible,
  .list__row:focus-visible {
    outline: 1px solid var(--accent-line);
    outline-offset: -1px;
  }

  .mini-card__cover,
  .home-grid--compact .tile > :global(.cover),
  .home-groups--compact .home-group__cover,
  .groups--compact .group__cover {
    width: 56px;
    height: 56px;
    flex: 0 0 56px;
    border-radius: var(--radius-sm);
    overflow: hidden;
  }

  .mini-card__side {
    display: flex;
    align-items: center;
    gap: 4px;
    flex: 0 0 auto;
    color: var(--text-tertiary);
  }

  .mini-card__meta {
    font-variant-numeric: tabular-nums;
  }

  .mini-card__text,
  .home-grid--compact .tile__body,
  .home-groups--compact .home-group__text,
  .groups--compact .group__text {
    display: flex;
    flex: 1 1 auto;
    flex-direction: column;
    gap: 1px;
    min-width: 0;
  }

  .mini-card__title,
  .home-grid--compact .tile__title,
  .home-groups--compact .home-group__text > span:first-child,
  .groups--compact .group__name {
    font-size: var(--text-sm);
    font-weight: var(--weight-medium);
    color: var(--text);
  }

  .mini-card__pct {
    flex: 0 0 auto;
    color: var(--text-tertiary);
    font-variant-numeric: tabular-nums;
  }

  .home-grid--compact .tile__badge,
  .home-grid--compact .tile__local,
  .home-groups--compact .home-group__share,
  .groups--compact .group__share {
    display: none;
  }

  /* Card mode shows the third line (series / date / duration); grid mode
     keeps it hidden and list mode reveals it again. */
  .home-grid--compact .tile__extra {
    display: block;
  }

  .home-grid--list {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .home-grid--list .tile {
    flex-direction: row;
    align-items: center;
    gap: var(--gap-row);
    padding: var(--gap-inline) var(--gap-row);
    border-radius: var(--radius-sm);
    text-align: left;
  }

  .home-grid--list .tile:nth-child(even) {
    background: var(--surface);
  }

  .home-grid--list .tile:hover {
    background: var(--surface-raised);
  }

  .home-grid--list .tile > :global(.cover) {
    width: 44px;
    height: 44px;
    flex: 0 0 44px;
    border-radius: var(--radius-xs);
    overflow: hidden;
  }

  .home-grid--list .tile__body {
    flex: 1 1 auto;
  }

  .home-grid--list .tile__extra {
    display: block;
  }

  .home-grid--list .tile__badge,
  .home-grid--list .tile__local {
    position: static;
    flex: 0 0 auto;
    box-shadow: none;
  }

  /* Group cards: three-column compact cards in grid mode, full-width rows
     with a share bar in list mode. No third component, no duplicated data. */
  .home-group__share {
    display: none;
    width: 112px;
    height: 3px;
    flex: 0 0 112px;
    border-radius: var(--radius-pill);
    background: var(--surface-inset);
    overflow: hidden;
  }

  .home-group__share > span {
    display: block;
    height: 100%;
    background: var(--positive);
  }

  .home-group__local {
    padding: 1px 6px;
    border-radius: var(--radius-pill);
    font-size: var(--text-2xs);
    color: var(--accent);
    background: var(--accent-soft);
  }

  .home-groups--list {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .home-groups--list .home-group {
    padding: var(--gap-inline) var(--gap-row);
    border: 0;
    border-bottom: 1px solid var(--hairline);
    border-radius: var(--radius-sm);
    background: transparent;
  }

  .home-groups--list .home-group:nth-child(odd) {
    background: var(--surface);
  }

  .home-groups--list .home-group:hover {
    background: var(--accent-soft);
  }

  .home-groups--list .home-group__share {
    display: block;
  }

  /* ── Search results: grouped chips above the unchanged book shelf ───────── */
  .search-groups {
    display: flex;
    flex-direction: column;
    gap: var(--gap-inline);
    padding: var(--gap-row);
    margin-bottom: var(--gap-block);
    border-radius: var(--radius-md);
    border: 1px solid var(--hairline);
    background: var(--surface);
  }

  .search-groups__row {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 6px;
  }

  .search-groups__label {
    flex: 0 0 56px;
    color: var(--text-tertiary);
  }

  .search-groups__chip {
    padding: 3px 10px;
    border-radius: var(--radius-pill);
    background: var(--accent-soft);
    color: var(--accent);
    font-size: var(--text-xs);
    max-width: 220px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .search-groups__chip:hover {
    background: var(--accent);
    color: var(--on-accent);
  }

  .search-groups__hint {
    margin: 0;
  }

  .search-groups__head {
    display: flex;
    align-items: baseline;
    gap: var(--gap-inline);
    padding-bottom: var(--gap-inline);
    margin-bottom: var(--gap-row);
    border-bottom: 1px solid var(--hairline);
    color: var(--text-secondary);
  }

  .search-groups__head .t-num {
    color: var(--text-tertiary);
  }

  /* ── Continue-listening hover card ─────────────────────────────────────── */
  .hover-info {
    display: flex;
    flex-direction: column;
    gap: var(--gap-inline);
    font-size: var(--text-xs);
  }

  .hover-info__head {
    display: flex;
    align-items: center;
    gap: var(--gap-inline);
  }

  .hover-info__cover {
    width: 42px;
    height: 42px;
    flex: 0 0 42px;
    border-radius: var(--radius-xs);
    overflow: hidden;
  }

  .hover-info__id {
    display: flex;
    flex: 1 1 auto;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }

  .hover-info__line {
    display: flex;
    gap: 6px;
    margin: 0;
    min-width: 0;
    color: var(--text-secondary);
  }

  .hover-info__key {
    flex: 0 0 auto;
    color: var(--accent);
  }

  .hover-info__desc {
    margin: 0;
    max-height: 96px;
    overflow: hidden;
    line-height: 1.55;
    color: var(--text-tertiary);
    display: -webkit-box;
    -webkit-line-clamp: 4;
    line-clamp: 4;
    -webkit-box-orient: vertical;
  }

  .hover-info__foot {
    display: flex;
    justify-content: space-between;
  }

  .hover-info__bar {
    height: 3px;
    border-radius: var(--radius-pill);
    background: var(--surface-inset);
    overflow: hidden;
  }

  .hover-info__bar > span {
    display: block;
    height: 100%;
    background: var(--accent);
  }

  .art-toast {
    position: fixed;
    right: var(--gap-block);
    bottom: 92px;
    z-index: 96;
    padding: var(--gap-inline) var(--gap-row);
    border-radius: var(--radius-sm);
    border: 1px solid var(--hairline-strong);
    background: var(--surface-overlay);
    box-shadow: var(--shadow-3);
    color: var(--text);
  }

  .page {
    position: relative;
    flex: 1 1 auto;
    min-height: 0;
    padding: var(--gap-block);
  }

  /* One scroll surface for the whole dashboard. No slider inside the history
     card and none beside the shelf: content is simply shown at full height. */
  .page.page--home {
    display: block;
    overflow-x: hidden;
    overflow-y: auto;
    padding: 0;
    scrollbar-width: none;
  }

  .page.page--home::-webkit-scrollbar {
    display: none;
  }

  /* Three equal tracks: heading on the left, the view switch on the centre
     line, and an empty right track. No text hint or second control competes
     with the switch at the far edge. */
  .viewbar {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
    align-items: center;
    gap: var(--gap-row);
    padding-bottom: var(--gap-row);
    margin-bottom: var(--gap-block);
    border-bottom: 1px solid var(--hairline);
  }

  .viewbar .shelf-tabs {
    justify-self: center;
  }

  .viewbar__count {
    justify-self: end;
  }

  .viewbar__head {
    display: flex;
    align-items: baseline;
    gap: var(--gap-inline);
    min-width: 0;
    justify-self: start;
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
    grid-column: 2;
    justify-self: center;
    flex: 0 0 auto;
    gap: 2px;
    padding: 3px;
    background: var(--surface-inset);
    border: 1px solid var(--hairline);
  }

  @media (max-width: 900px) {
    .viewbar {
      grid-template-columns: minmax(0, 1fr);
      row-gap: var(--gap-inline);
    }
    .viewbar :global(.segmented--views) {
      grid-column: 1;
      justify-self: start;
    }
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
    width: 100%;
    min-width: 0;
    box-sizing: border-box;
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
    position: relative;
    display: block;
    width: 100%;
    aspect-ratio: 1;
    border-radius: var(--radius-xs);
    overflow: hidden;
  }

  /* Book count sits on the cover, so the text block can carry real facts
     (author, total length, how much has been heard) instead of "共 1 本". */
  .group__badge {
    position: absolute;
    right: 6px;
    bottom: 6px;
    padding: 2px 7px;
    border-radius: var(--radius-pill);
    border: 1px solid var(--hairline-strong);
    background: var(--surface-overlay);
    box-shadow: var(--shadow-1);
    color: var(--text);
    font-size: var(--text-2xs);
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

  .group__facts {
    font-size: var(--text-2xs);
  }

  .group__listened {
    display: block;
    height: 3px;
    border-radius: var(--radius-pill);
    background: var(--surface-inset);
    overflow: hidden;
  }

  .group__listened > span {
    display: block;
    height: 100%;
    background: var(--accent);
  }

  .groups--compact .group__badge,
  .groups--compact .group__listened,
  .groups--list .group__badge,
  .groups--list .group__listened {
    display: none;
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

  /* ── Group shelves use the BOOK tile, not a second card language ──────────
     Series / author / narrator cards used to be 38px horizontal strips while
     books were cover-forward tiles. In the default grid they now share the
     same geometry; compact and list still have their own denser shapes. */
  .home-groups:not(.home-groups--list):not(.home-groups--compact) {
    grid-template-columns: repeat(auto-fill, minmax(min(148px, 100%), 1fr));
    gap: var(--gap-row);
  }

  .home-groups:not(.home-groups--list):not(.home-groups--compact) .home-group {
    flex-direction: column;
    align-items: stretch;
    gap: 6px;
    padding: 6px;
    border-color: transparent;
    background: transparent;
    border-radius: var(--radius-md);
  }

  .home-groups:not(.home-groups--list):not(.home-groups--compact) .home-group__cover {
    width: 100%;
    height: auto;
    aspect-ratio: 1;
    flex: 0 0 auto;
    border-radius: var(--radius-md);
  }

  .home-groups:not(.home-groups--list):not(.home-groups--compact) .home-group__text {
    font-size: var(--text-sm);
    font-weight: var(--weight-medium);
    color: var(--text);
  }

  .home-groups:not(.home-groups--list):not(.home-groups--compact) .home-group__share,
  .home-groups:not(.home-groups--list):not(.home-groups--compact) .home-group__local {
    display: none;
  }

  /* The library-wide group page follows the same cover-forward rhythm as the
     book shelf — but ONLY in grid mode. This block sits late in the cascade,
     so the scoping is essential: unscoped, `.groups` also overrode the 300px
     compact columns and the single-column list, squeezing group cards into
     148px chips whose titles were truncated to three characters. */
  .groups:not(.groups--list):not(.groups--compact) {
    grid-template-columns: repeat(auto-fill, minmax(min(148px, 100%), 1fr));
  }

  .groups.groups--compact {
    grid-template-columns: repeat(auto-fill, minmax(min(300px, 100%), 1fr));
    gap: 10px;
    align-content: start;
  }

  .groups.groups--list {
    grid-template-columns: minmax(0, 1fr);
  }

  .groups:not(.groups--list):not(.groups--compact) .group {
    padding: 6px;
    border-color: transparent;
    background: transparent;
    border-radius: var(--radius-md);
  }

  /* The queue owns the rail's leftover height but never stretches its rows.
     `min-height: 0` + `overflow: hidden` stop an over-full queue from growing
     the panel, which keeps the measured height independent of the row count. */
  .home__side .queue {
    flex: 1 1 auto;
    min-height: 0;
    overflow: hidden;
    justify-content: flex-start;
  }

  @media (max-width: 1080px) {
    .home {
      min-height: auto;
    }
    .home__side .queue {
      flex: 0 0 auto;
      overflow: visible;
    }
  }

  /* Wide windows: the listening rail and the book shelf are two INDEPENDENT
     panes. The page itself stops scrolling and the right-hand shelf owns the
     only shelf scrollbar, so dragging it can never move 继续收听. Forcing the
     grid row to 1fr gives the rail a viewport-height box — that is also the
     height the queue's ResizeObserver measures, so the row budget still
     follows the window. Narrow windows keep the single page scroll above.
     HoverCard popovers are position: fixed, so they escape both panes. */
  @media (min-width: 1081px) {
    .page.page--home {
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }

    .home {
      flex: 1 1 auto;
      height: 100%;
      min-height: 0;
      grid-template-rows: minmax(0, 1fr);
      overflow: hidden;
    }

    .home__side {
      overflow: hidden;
    }

    .home__panel {
      overflow-x: hidden;
      overflow-y: auto;
      overscroll-behavior: contain;
      scrollbar-width: thin;
    }

    .home__main {
      overflow-x: hidden;
      overflow-y: auto;
      overscroll-behavior: contain;
      scrollbar-width: thin;
    }
  }
</style>
