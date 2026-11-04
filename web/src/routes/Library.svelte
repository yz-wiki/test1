<script lang="ts">
  import { library, session, ui } from '../lib/state.svelte';
  import { progress } from '../lib/state.svelte';
  import { player } from '../lib/player.svelte';
  import { t, formatLength } from '../lib/i18n.svelte';
  import Icon from '../components/Icon.svelte';
  import Cover from '../components/Cover.svelte';

  // Reload whenever the active library or server changes.
  $effect(() => {
    void library.load(session.serverUrl, session.activeLibraryId);
  });

  let query = $state('');

  const visible = $derived.by(() => {
    const q = query.trim().toLowerCase();
    if (!q) return library.items;
    return library.items.filter(item => {
      const meta = item.media?.metadata;
      return [meta?.title, meta?.authorName, meta?.seriesName]
        .filter(Boolean)
        .some(value => String(value).toLowerCase().includes(q));
    });
  });

  /** "Continue listening" means unfinished rows the server actually has, newest
   *  first — not simply the first six titles in the library. */
  const recent = $derived.by(() => {
    const started = progress.rows
      .filter(row => !row.isFinished && row.currentTime > 0)
      .sort((a, b) => b.lastUpdate - a.lastUpdate)
      .slice(0, 6)
      .map(row => library.items.find(item => item.id === row.libraryItemId))
      .filter((item): item is (typeof library.items)[number] => Boolean(item));
    return started.length > 0 ? started : visible.slice(0, 6);
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

  function title(item: (typeof library.items)[number]): string {
    return item.media?.metadata?.title?.trim() || t('common.unknown');
  }

  function author(item: (typeof library.items)[number]): string {
    return item.media?.metadata?.authorName?.trim() || '';
  }
</script>

<div class="toolbar">
  <div class="search" style="width: 320px">
    <span class="search__icon"><Icon name="search" size={14} /></span>
    <input class="input" bind:value={query} placeholder={t('library.search')} spellcheck="false" />
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

<div class="page scroll-y">
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
  {:else if visible.length === 0}
    <div class="empty">
      <Icon name="book" size={26} />
      <span class="empty__title">{t('library.empty')}</span>
      <span class="empty__body">{t('library.emptyHint')}</span>
    </div>
  {:else}
    <section class="section">
      <h2 class="t-label">{t('library.continue')}</h2>
      <div class="shelf">
        {#each recent as item (item.id)}
          {@const fraction = progress.fraction(item.id)}
          <button class="shelf__card" onclick={() => resume(item)}>
            <div class="shelf__cover">
              <Cover itemId={item.id} size={168} />
            </div>
            <div class="shelf__text">
              <span class="truncate" style="font-weight: var(--weight-medium)">{title(item)}</span>
              <span class="t-small truncate">{author(item)}</span>
              <span class="t-tertiary t-num" style="font-size: var(--text-xs)">
                {item.mediaType === 'podcast'
                  ? t('podcast.episodes', { count: item.media?.episodes?.length ?? 0 })
                  : formatLength(item.media?.duration ?? 0)}
              </span>
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

    <section class="section">
      <h2 class="t-label">{t('library.all')}</h2>
      <div class="grid">
        {#each visible as item (item.id)}
          <button
            class="tile"
            aria-current={player.item?.id === item.id && player.playing ? 'true' : undefined}
            onclick={() => open(item)}
          >
            <Cover itemId={item.id} size={320} />
            <span class="tile__title">{title(item)}</span>
            <span class="tile__meta">{author(item) || formatLength(item.media?.duration ?? 0)}</span>
          </button>
        {/each}
      </div>
    </section>
  {/if}
</div>

<style>
  .page {
    flex: 1 1 auto;
    min-height: 0;
    padding: var(--gap-block);
  }

  .section + .section {
    margin-top: var(--gap-section);
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
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(148px, 1fr));
    gap: var(--gap-block) var(--gap-panel);
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
