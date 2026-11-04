<script lang="ts">
  import { library, session, ui } from '../lib/state.svelte';
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

  const recent = $derived(visible.slice(0, 6));

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
          <button class="shelf__card" onclick={() => (ui.query = item.id)}>
            <div class="shelf__cover">
              <Cover itemId={item.id} size={168} />
            </div>
            <div class="shelf__text">
              <span class="truncate" style="font-weight: var(--weight-medium)">{title(item)}</span>
              <span class="t-small truncate">{author(item)}</span>
              <span class="t-tertiary t-num" style="font-size: var(--text-xs)">
                {formatLength(item.media?.duration ?? 0)}
              </span>
            </div>
          </button>
        {/each}
      </div>
    </section>

    <section class="section">
      <h2 class="t-label">{t('library.all')}</h2>
      <div class="grid">
        {#each visible as item (item.id)}
          <button class="tile">
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
