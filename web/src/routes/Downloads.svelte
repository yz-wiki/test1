<script lang="ts">
  import { downloads } from '../lib/downloads.svelte';
  import { library, progress, ui } from '../lib/state.svelte';
  import { t } from '../lib/i18n.svelte';
  import Cover from '../components/Cover.svelte';
  import Icon from '../components/Icon.svelte';

  const rows = $derived(downloads.records);

  function title(itemId: string, fallback: string): string {
    const item = library.items.find(entry => entry.id === itemId);
    return item?.media?.metadata?.title?.trim() || fallback || itemId;
  }

  function size(bytes: number): string {
    const mb = bytes / 1048576;
    return mb >= 1024 ? `${(mb / 1024).toFixed(2)} GB` : `${mb.toFixed(0)} MB`;
  }

  function open(itemId: string): void {
    ui.itemId = itemId;
    ui.route = 'book';
  }
</script>

<div class="page scroll-y">
  <div class="head">
    <h1 class="t-title">{t('downloads.title')}</h1>
    <span class="t-small t-num t-tertiary">
      {t('downloads.count', { count: rows.length })}
    </span>
    <div class="grow"></div>
    <button class="icon-btn" aria-label={t('library.refresh')} title={t('library.refresh')} onclick={() => void downloads.load()}>
      <Icon name="refresh" />
    </button>
  </div>

  {#if Object.keys(downloads.transfers).length > 0}
    <ul class="rows">
      {#each Object.values(downloads.transfers) as transfer (transfer.itemId)}
        {@const pct = transfer.totalBytes > 0
          ? Math.round((transfer.bytesDownloaded / transfer.totalBytes) * 100)
          : 0}
        <li>
          <div class="row row--static">
            <span class="row__cover"><Cover itemId={transfer.itemId} size={72} title={transfer.title} /></span>
            <span class="row__body">
              <span class="truncate row__title">{transfer.title || transfer.itemId}</span>
              <span class="t-small t-tertiary t-num">
                {t('downloads.downloading', { pct })}
              </span>
              <span class="bar" aria-hidden="true"><span style:width="{pct}%"></span></span>
            </span>
          </div>
        </li>
      {/each}
    </ul>
  {/if}

  {#if rows.length === 0 && Object.keys(downloads.transfers).length === 0}
    <div class="empty">
      <Icon name="book" size={26} />
      <span class="empty__title">{t('downloads.empty')}</span>
      <span class="empty__body">{t('downloads.emptyHint')}</span>
    </div>
  {:else}
    <ul class="rows">
      {#each rows as record (record.itemId)}
        {@const fraction = progress.fraction(record.itemId)}
        <li>
          <div class="row row--static">
            <button class="row__cover" onclick={() => open(record.itemId)} aria-label={title(record.itemId, record.title)}>
              <Cover itemId={record.itemId} size={72} title={title(record.itemId, record.title)} />
            </button>
            <span class="row__body">
              <button class="row__title-btn" onclick={() => open(record.itemId)}>
                <span class="truncate row__title">{title(record.itemId, record.title)}</span>
              </button>
              <span class="t-small t-tertiary truncate">{record.author}</span>
              <span class="t-small t-num t-tertiary">
                {size(record.fileSize)}
                {#if fraction > 0}· {Math.round(fraction * 100)}%{/if}
                {#if record.serverDeleted}· <span class="warn">{t('downloads.deleted')}</span>{/if}
              </span>
            </span>
            <button class="btn btn--quiet btn--sm" onclick={() => void downloads.remove(record.itemId)}>
              {t('downloads.remove')}
            </button>
          </div>
        </li>
      {/each}
    </ul>
  {/if}

  {#if downloads.error}
    <p class="t-small form-error" role="alert">{downloads.error}</p>
  {/if}
</div>

<style>
  .page {
    flex: 1 1 auto;
    min-height: 0;
    padding: var(--gap-block);
    display: flex;
    flex-direction: column;
    gap: var(--gap-block);
  }

  /* In a scrolling flex column, children default to flex-shrink:1 and get
     squeezed to a sliver once the content is taller than the viewport. */
  .page > * {
    flex: 0 0 auto;
  }

  .head {
    display: flex;
    align-items: baseline;
    gap: var(--gap-row);
  }

  .rows {
    display: flex;
    flex-direction: column;
    gap: 2px;
    list-style: none;
  }

  .row {
    display: flex;
    align-items: center;
    gap: var(--gap-row);
    padding: var(--gap-inline);
    border-radius: var(--radius-sm);
  }

  .row:hover {
    background: var(--surface-raised);
  }

  .row--static:hover {
    background: transparent;
  }

  .row__cover {
    width: 44px;
    height: 44px;
    flex: 0 0 44px;
    border-radius: var(--radius-xs);
    overflow: hidden;
  }

  .row__body {
    display: flex;
    flex-direction: column;
    gap: 1px;
    min-width: 0;
    flex: 1 1 auto;
  }

  .row__title-btn {
    text-align: left;
    min-width: 0;
  }

  .row__title {
    display: block;
    font-size: var(--text-sm);
    color: var(--text);
    font-weight: var(--weight-medium);
  }

  .bar {
    display: block;
    height: 2px;
    margin-top: 5px;
    border-radius: var(--radius-pill);
    background: var(--surface-inset);
    overflow: hidden;
  }

  .bar > span {
    display: block;
    height: 100%;
    background: var(--accent);
  }

  .warn {
    color: var(--warning);
  }

  .form-error {
    color: var(--danger);
  }
</style>
