<script lang="ts">
  /**
   * Continue listening, as its own screen.
   *
   * A horizontal shelf can only ever show a few books and says almost nothing
   * about them. This page is the full in-progress queue: the chapter each book
   * is on, how far into it, and how much is left. Chapter data comes from the
   * lazily-fetched full items in `reading`, because shelf items omit it.
   */
  import { library, progress, session, ui } from '../lib/state.svelte';
  import { reading } from '../lib/reading.svelte';
  import { player } from '../lib/player.svelte';
  import { t, formatDuration, formatLength } from '../lib/i18n.svelte';
  import type { LibraryItem, MediaProgress } from '../lib/ipc';
  import Cover from '../components/Cover.svelte';
  import Icon from '../components/Icon.svelte';

  interface Entry {
    row: MediaProgress;
    item: LibraryItem;
  }

  const entries = $derived.by<Entry[]>(() =>
    progress.rows
      .filter(row => !row.isFinished && row.currentTime > 0)
      .sort((a, b) => b.lastUpdate - a.lastUpdate)
      .map(row => {
        const item =
          library.items.find(entry => entry.id === row.libraryItemId) ??
          reading.detail(row.libraryItemId);
        return item ? { row, item } : null;
      })
      .filter((entry): entry is Entry => entry !== null),
  );

  // Full items supply chapters; ask only for the ids on this page.
  $effect(() => {
    const ids = progress.rows
      .filter(row => !row.isFinished && row.currentTime > 0)
      .map(row => row.libraryItemId);
    void reading.ensure(session.serverUrl, ids);
  });

  const latest = $derived(entries[0] ?? null);

  function titleOf(item: LibraryItem): string {
    return item.media?.metadata?.title?.trim() || t('common.unknown');
  }

  function authorOf(item: LibraryItem): string {
    return item.media?.metadata?.authorName?.trim() || '';
  }

  function fractionOf(item: LibraryItem): number {
    return progress.fraction(item.id);
  }

  function when(at: number): string {
    if (!at) return '';
    return new Date(at).toLocaleString();
  }

  function play(entry: Entry): void {
    void player.open(entry.item).then(() => player.expand());
  }

  function openDetails(entry: Entry): void {
    ui.itemId = entry.item.id;
    ui.route = entry.item.mediaType === 'podcast' ? 'podcast' : 'book';
  }
</script>

<div class="page scroll-y">
  <header class="head">
    <div>
      <h1 class="t-title">{t('continue.title')}</h1>
      <p class="t-small t-secondary">{t('continue.subtitle')}</p>
    </div>
    <span class="t-small t-num t-tertiary">
      {t('continue.books', { count: entries.length })}
    </span>
  </header>

  {#if entries.length === 0}
    <div class="empty">
      <Icon name="headphones" size={28} />
      <span class="empty__title">{t('continue.empty')}</span>
      <span class="empty__body">{t('continue.emptyHint')}</span>
      <button class="btn btn--sm" onclick={() => (ui.route = 'library')}>
        {t('nav.library')}
      </button>
    </div>
  {:else}
    {#if latest}
      {@const chapter = reading.chapterAt(latest.item, latest.row.currentTime)}
      {@const pct = Math.round(fractionOf(latest.item) * 100)}
      <section class="hero">
        <div class="hero__cover">
          <Cover itemId={latest.item.id} size={320} title={titleOf(latest.item)} />
        </div>
        <div class="hero__body">
          <span class="t-label t-accent">{t('continue.lastPlayed')} · {when(latest.row.lastUpdate)}</span>
          <h2 class="hero__title">{titleOf(latest.item)}</h2>
          <p class="t-small t-secondary">{authorOf(latest.item)}</p>

          {#if chapter}
            <p class="hero__chapter">
              <span class="t-num t-small t-tertiary">
                {t('continue.chapter', { index: chapter.index, total: chapter.total })}
              </span>
              <span class="truncate">{chapter.title}</span>
            </p>
          {/if}

          <div class="hero__bar" aria-hidden="true">
            <span style:width="{pct}%"></span>
          </div>
          <div class="hero__foot t-num t-small t-tertiary">
            <span>{formatDuration(latest.row.currentTime)} / {formatLength(latest.item.media?.duration ?? 0)}</span>
            <span>{pct}% · {t('continue.remaining', { time: formatLength(Math.max((latest.item.media?.duration ?? 0) - latest.row.currentTime, 0)) })}</span>
          </div>

          <div class="hero__actions">
            <button class="btn btn--primary" onclick={() => play(latest)}>
              <Icon name="play" size={14} />
              {t('continue.resume')}
            </button>
            <button class="btn btn--quiet" onclick={() => openDetails(latest)}>
              {t('menu.details')}
            </button>
          </div>
        </div>
      </section>
    {/if}

    <h2 class="t-label list__head">{t('continue.books', { count: entries.length })}</h2>
    <div class="list">
      {#each entries as entry (entry.row.libraryItemId)}
        {@const chapter = reading.chapterAt(entry.item, entry.row.currentTime)}
        {@const pct = Math.round(fractionOf(entry.item) * 100)}
        <button class="row" onclick={() => play(entry)}>
          <span class="row__cover">
            <Cover itemId={entry.item.id} size={168} title={titleOf(entry.item)} />
          </span>
          <span class="row__main">
            <span class="truncate row__title">{titleOf(entry.item)}</span>
            <span class="t-small t-tertiary truncate">
              {#if chapter}
                {t('continue.chapter', { index: chapter.index, total: chapter.total })} · {chapter.title}
              {:else}
                {authorOf(entry.item)}
              {/if}
            </span>
          </span>
          <span class="row__progress">
            <span class="bar" aria-hidden="true"><span style:width="{pct}%"></span></span>
            <span class="t-num t-small t-tertiary">{pct}%</span>
          </span>
          <span class="row__time t-num t-small t-tertiary">
            {formatLength(Math.max((entry.item.media?.duration ?? 0) - entry.row.currentTime, 0))}
          </span>
          <span class="row__go"><Icon name="play" size={13} /></span>
        </button>
      {/each}
    </div>
  {/if}
</div>

<style>
  .page {
    flex: 1 1 auto;
    min-height: 0;
    padding: var(--gap-section) var(--gap-block) var(--gap-block);
  }

  .head {
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    gap: var(--gap-row);
    margin-bottom: var(--gap-section);
  }

  .head > div {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .hero {
    display: flex;
    gap: var(--gap-section);
    padding: var(--gap-panel);
    border-radius: var(--radius-md);
    border: 1px solid var(--hairline);
    background: var(--surface);
  }

  .hero__cover {
    width: 148px;
    flex: 0 0 148px;
    border-radius: var(--radius-sm);
    overflow: hidden;
    box-shadow: var(--shadow-2);
  }

  .hero__body {
    display: flex;
    flex: 1 1 auto;
    flex-direction: column;
    gap: 6px;
    min-width: 0;
  }

  .hero__title {
    font-size: var(--text-xl);
    font-weight: var(--weight-semibold);
  }

  .hero__chapter {
    display: flex;
    align-items: baseline;
    gap: var(--gap-inline);
    min-width: 0;
    margin-top: 2px;
    font-size: var(--text-sm);
    color: var(--text);
  }

  .hero__bar {
    height: 5px;
    margin-top: auto;
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
    gap: var(--gap-row);
  }

  .hero__actions {
    display: flex;
    gap: var(--gap-inline);
    margin-top: var(--gap-inline);
  }

  .list__head {
    display: block;
    margin: var(--gap-section) 0 var(--gap-row);
  }

  .list {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .row {
    display: grid;
    grid-template-columns: 48px minmax(0, 1fr) 150px 90px 28px;
    align-items: center;
    gap: var(--gap-row);
    padding: 8px var(--gap-row);
    border-radius: var(--radius-sm);
    border: 1px solid transparent;
    text-align: left;
  }

  .row:hover {
    background: var(--surface);
    border-color: var(--hairline);
  }

  .row__cover {
    width: 48px;
    height: 48px;
    border-radius: var(--radius-xs);
    overflow: hidden;
  }

  .row__main {
    display: flex;
    flex-direction: column;
    gap: 3px;
    min-width: 0;
  }

  .row__title {
    font-size: var(--text-sm);
    font-weight: var(--weight-medium);
  }

  .row__progress {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .bar {
    display: block;
    flex: 1 1 auto;
    height: 4px;
    border-radius: var(--radius-pill);
    background: var(--surface-inset);
    overflow: hidden;
  }

  .bar > span {
    display: block;
    height: 100%;
    background: var(--accent);
  }

  .row__time {
    text-align: right;
  }

  .row__go {
    display: grid;
    place-items: center;
    color: var(--text-tertiary);
  }

  .empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--gap-inline);
    padding: var(--gap-section);
    color: var(--text-tertiary);
  }

  .empty__title {
    color: var(--text);
    font-weight: var(--weight-medium);
  }
</style>
