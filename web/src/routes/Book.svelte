<script lang="ts">
  import { fetchItem, updateMedia, updateProgress, type LibraryItem } from '../lib/ipc';
  import { beginDownload } from '../lib/downloadFlow';
  import { library, progress, session, ui } from '../lib/state.svelte';
  import { chapterSpans, player } from '../lib/player.svelte';
  import { downloads } from '../lib/downloads.svelte';
  import { t, formatDuration, formatLength } from '../lib/i18n.svelte';
  import Cover from '../components/Cover.svelte';
  import Icon from '../components/Icon.svelte';

  let detail = $state<LibraryItem | null>(null);
  let loading = $state(true);
  let error = $state<string | null>(null);
  let tab = $state<'chapters' | 'files'>('chapters');
  let expanded = $state(false);
  let editing = $state(false);
  let saving = $state(false);
  let form = $state({
    title: '',
    subtitle: '',
    authors: '',
    narrators: '',
    series: '',
    publisher: '',
    year: '',
    language: '',
    genres: '',
    tags: '',
    description: '',
  });

  /** The shelf copy renders instantly; the full item (files, chapters, series)
   *  replaces it when the server answers. */
  const cached = $derived(library.items.find(entry => entry.id === ui.itemId) ?? null);
  const item = $derived(detail ?? cached);
  const meta = $derived(item?.media?.metadata);
  const chapters = $derived(chapterSpans(item));
  const files = $derived(item?.libraryFiles ?? []);
  const fraction = $derived(ui.itemId ? progress.fraction(ui.itemId) : 0);
  const saved = $derived(ui.itemId ? progress.for(ui.itemId) : undefined);
  const isFinished = $derived(saved?.isFinished ?? false);
  const download = $derived(ui.itemId ? downloads.forItem(ui.itemId) : undefined);
  const transfer = $derived(ui.itemId ? downloads.transfers[ui.itemId] : undefined);
  const transferPct = $derived(
    transfer && transfer.totalBytes > 0
      ? Math.round((transfer.bytesDownloaded / transfer.totalBytes) * 100)
      : 0,
  );

  $effect(() => {
    const itemId = ui.itemId;
    if (!itemId || !session.serverUrl) return;
    let cancelled = false;
    loading = true;
    error = null;
    detail = null;
    fetchItem(session.serverUrl, itemId)
      .then(result => {
        if (!cancelled) detail = result;
      })
      .catch(reason => {
        if (!cancelled) error = (reason as Error).message;
      })
      .finally(() => {
        if (!cancelled) loading = false;
      });
    return () => {
      cancelled = true;
    };
  });

  const series = $derived.by(() => {
    if (!meta?.seriesName) return '';
    return meta.seriesSequence
      ? t('book.series', { n: meta.seriesSequence, series: meta.seriesName })
      : meta.seriesName;
  });

  const facts = $derived(
    [
      meta?.narratorName ? t('player.narrator', { name: meta.narratorName }) : '',
      meta?.publishedYear ?? '',
      meta?.language ?? '',
      chapters.length > 0 ? t('book.chapterCount', { count: chapters.length }) : '',
      files.length > 0 ? t('book.fileCount', { count: files.length }) : '',
    ].filter(Boolean),
  );

  function play(from?: number): void {
    if (!item) return;
    void player.open(item, null, undefined, from);
  }

  async function toggleFinished(): Promise<void> {
    if (!item || !session.serverUrl) return;
    const duration = item.media?.duration ?? 0;
    try {
      await updateProgress(
        session.serverUrl,
        item.id,
        isFinished ? 0 : duration,
        duration,
        !isFinished,
      );
      await progress.load(session.serverUrl, true);
    } catch (reason) {
      error = (reason as Error).message;
    }
  }

  /** "Name #3" → series name plus sequence, which is how ABS models a series. */
  function parseSeries(value: string): { seriesName: string; sequence: string } | null {
    const text = value.trim();
    if (!text) return null;
    const match = text.match(/^(.*?)\s*#\s*([\w.]+)\s*$/);
    if (match) return { seriesName: match[1].trim(), sequence: match[2].trim() };
    return { seriesName: text, sequence: '' };
  }

  function openEditor(): void {
    const m = meta;
    form = {
      title: m?.title ?? '',
      subtitle: m?.subtitle ?? '',
      authors: m?.authorName ?? '',
      narrators: m?.narratorName ?? '',
      series: [m?.seriesName, m?.seriesSequence].filter(Boolean).join(' #'),
      publisher: m?.publisher ?? '',
      year: m?.publishedYear ?? '',
      language: m?.language ?? '',
      genres: (m?.genres ?? []).join(', '),
      tags: (m?.tags ?? []).join(', '),
      description: m?.description ?? '',
    };
    editing = true;
  }

  async function saveMetadata(): Promise<void> {
    if (!item || !session.serverUrl) return;
    saving = true;
    error = null;
    const series = parseSeries(form.series);
    try {
      await updateMedia(session.serverUrl, item.id, {
        metadata: {
          title: form.title.trim(),
          subtitle: form.subtitle.trim(),
          authors: form.authors
            .split(',')
            .map(name => ({ name: name.trim() }))
            .filter(author => author.name),
          narrators: form.narrators.split(',').map(name => name.trim()).filter(Boolean),
          series: series ? [series] : [],
          publisher: form.publisher.trim(),
          publishedYear: form.year.trim(),
          language: form.language.trim(),
          genres: form.genres.split(',').map(genre => genre.trim()).filter(Boolean),
          description: form.description,
        },
        tags: form.tags.split(',').map(tag => tag.trim()).filter(Boolean),
      });
      detail = await fetchItem(session.serverUrl, item.id);
      await library.load(session.serverUrl, session.activeLibraryId, true);
      editing = false;
    } catch (reason) {
      error = (reason as Error).message;
    } finally {
      saving = false;
    }
  }

  async function startDownload(): Promise<void> {
    if (!item) return;
    try {
      await beginDownload(item, meta?.title ?? item.id, meta?.authorName ?? '');
    } catch (reason) {
      error = (reason as Error).message;
    }
  }

  function size(bytes: number | undefined): string {    if (!bytes) return '';
    const mb = bytes / 1048576;
    return mb >= 1024 ? `${(mb / 1024).toFixed(1)} GB` : `${mb.toFixed(1)} MB`;
  }
</script>

{#if item}
  <div class="page scroll-y">
    <button class="btn btn--quiet btn--sm" onclick={() => (ui.route = 'library')}>
      <Icon name="chevron-left" size={14} />
      {t('book.back')}
    </button>

    <header class="head">
      <div class="head__cover">
        <Cover itemId={item.id} size={420} radius="var(--radius-md)" title={meta?.title ?? ''} />
      </div>

      <div class="head__text">
        {#if series}
          <span class="t-label">{series}</span>
        {/if}
        <h1 class="t-title clamp-2">{meta?.title ?? item.id}</h1>
        {#if meta?.subtitle}
          <p class="t-secondary clamp-2">{meta.subtitle}</p>
        {/if}
        <p class="t-secondary truncate">{meta?.authorName ?? ''}</p>

        <div class="facts">
          {#each facts as fact (fact)}
            <span class="t-small t-tertiary">{fact}</span>
          {/each}
        </div>

        {#if fraction > 0}
          <div class="resume">
            <div class="resume__bar" aria-hidden="true">
              <span style:width="{fraction * 100}%"></span>
            </div>
            <span class="t-small t-tertiary t-num">
              {t('book.progress', {
                done: formatLength((item.media?.duration ?? 0) * fraction),
                total: formatLength(item.media?.duration ?? 0),
              })}
            </span>
          </div>
        {/if}

        <div class="actions">
          <button class="btn btn--primary" onclick={() => play()} disabled={player.loading}>
            <Icon name="play" size={15} />
            {fraction > 0 ? t('book.continue') : t('book.start')}
          </button>
          {#if fraction > 0}
            <button class="btn btn--quiet" onclick={() => play(0)}>{t('book.restart')}</button>
          {/if}
          <button class="btn btn--quiet" onclick={() => (editing ? (editing = false) : openEditor())}>
            {t('book.edit')}
          </button>
          <button class="btn btn--quiet" onclick={() => void toggleFinished()}>
            {isFinished ? t('book.markUnfinished') : t('book.markFinished')}
          </button>

          {#if transfer}
            <button class="btn btn--quiet" disabled>
              {t('downloads.downloading', { pct: transferPct })}
            </button>
          {:else if download}
            <button class="btn btn--quiet" disabled>
              <Icon name="check" size={14} />
              {t('downloads.downloaded')}
            </button>
          {:else}
            <button
              class="btn btn--quiet"
              onclick={() => void startDownload()}
            >
              <Icon name="download" size={14} />
              {t('downloads.download')}
            </button>
          {/if}
        </div>

        {#if error}
          <p class="t-small form-error" role="alert">{error}</p>
        {/if}
      </div>
    </header>

    {#if editing}
      <section class="block editor">
        <div class="editor__grid">
          <label class="field"><span class="field__label">{t('meta.title')}</span>
            <input class="input" bind:value={form.title} /></label>
          <label class="field"><span class="field__label">{t('meta.subtitle')}</span>
            <input class="input" bind:value={form.subtitle} /></label>
          <label class="field"><span class="field__label">{t('meta.authors')}</span>
            <input class="input" bind:value={form.authors} placeholder={t('meta.commaHint')} /></label>
          <label class="field"><span class="field__label">{t('meta.narrators')}</span>
            <input class="input" bind:value={form.narrators} placeholder={t('meta.commaHint')} /></label>
          <label class="field"><span class="field__label">{t('meta.series')}</span>
            <input class="input" bind:value={form.series} placeholder="名称 #3" /></label>
          <label class="field"><span class="field__label">{t('meta.publisher')}</span>
            <input class="input" bind:value={form.publisher} /></label>
          <label class="field"><span class="field__label">{t('meta.year')}</span>
            <input class="input" bind:value={form.year} /></label>
          <label class="field"><span class="field__label">{t('meta.language')}</span>
            <input class="input" bind:value={form.language} /></label>
          <label class="field"><span class="field__label">{t('meta.genres')}</span>
            <input class="input" bind:value={form.genres} placeholder={t('meta.commaHint')} /></label>
          <label class="field"><span class="field__label">{t('meta.tags')}</span>
            <input class="input" bind:value={form.tags} placeholder={t('meta.commaHint')} /></label>
        </div>
        <label class="field">
          <span class="field__label">{t('meta.description')}</span>
          <textarea class="textarea" rows="6" bind:value={form.description}></textarea>
        </label>
        <div class="editor__actions">
          <button class="btn btn--primary btn--sm" disabled={saving} onclick={() => void saveMetadata()}>
            {saving ? t('meta.saving') : t('meta.save')}
          </button>
          <button class="btn btn--quiet btn--sm" onclick={() => (editing = false)}>{t('common.cancel')}</button>
        </div>
      </section>
    {/if}

    {#if meta?.description || (meta?.genres?.length ?? 0) > 0}
      <section class="block">
        <p class="t-body selectable" class:clamped={!expanded}>
          {meta?.description ?? t('book.noDescription')}
        </p>
        {#if meta?.description && meta.description.length > 320}
          <button class="btn btn--quiet btn--sm" onclick={() => (expanded = !expanded)}>
            {expanded ? t('book.less') : t('book.more')}
          </button>
        {/if}
        {#if meta?.genres?.length}
          <div class="chips">
            {#each meta.genres as genre (genre)}
              <span class="chip">{genre}</span>
            {/each}
          </div>
        {/if}
      </section>
    {/if}

    <section class="block">
      <div class="segmented block__tabs">
        <button
          class="segmented__item"
          aria-pressed={tab === 'chapters'}
          onclick={() => (tab = 'chapters')}
        >{t('book.chapters')}</button>
        <button
          class="segmented__item"
          aria-pressed={tab === 'files'}
          onclick={() => (tab = 'files')}
        >{t('book.files')}</button>
      </div>

      {#if tab === 'chapters'}
        {#if chapters.length === 0}
          <p class="t-small t-tertiary">{t('player.noChapters')}</p>
        {:else}
          <ul class="rows">
            {#each chapters as chapter, index (index)}
              <li>
                <button class="row" onclick={() => play(chapter.start)}>
                  <span class="row__index t-num">{index + 1}</span>
                  <span class="row__body">
                    <span class="truncate row__title">{chapter.title}</span>
                    <span class="t-small t-num t-tertiary">
                      {formatDuration(chapter.start)} · {formatDuration(chapter.end - chapter.start)}
                    </span>
                  </span>
                </button>
              </li>
            {/each}
          </ul>
        {/if}
      {:else if files.length === 0}
        <p class="t-small t-tertiary">{t('common.unknown')}</p>
      {:else}
        <ul class="rows">
          {#each files as file (file.ino)}
            <li>
              <div class="row row--static">
                <span class="row__index"><Icon name="book" size={14} /></span>
                <span class="row__body">
                  <span class="truncate row__title">{file.metadata?.filename ?? file.ino}</span>
                  <span class="t-small t-tertiary t-num">{size(file.metadata?.size)}</span>
                </span>
              </div>
            </li>
          {/each}
        </ul>
      {/if}
    </section>
  </div>
{:else if loading}
  <div class="page">
    <span class="t-small t-tertiary">{t('book.loading')}</span>
  </div>
{:else}
  <div class="empty">
    <span class="empty__title">{t('library.error')}</span>
    <button class="btn btn--sm" onclick={() => (ui.route = 'library')}>{t('book.back')}</button>
  </div>
{/if}

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
    gap: var(--gap-section);
    align-items: flex-start;
  }

  .head__cover {
    width: 200px;
    height: 200px;
    flex: 0 0 200px;
    border-radius: var(--radius-md);
    overflow: hidden;
    box-shadow: var(--shadow-2);
  }

  .head__text {
    display: flex;
    flex-direction: column;
    gap: var(--gap-tight);
    min-width: 0;
    max-width: 760px;
  }

  .facts {
    display: flex;
    flex-wrap: wrap;
    gap: var(--gap-row);
    margin-top: var(--gap-hair);
  }

  .resume {
    display: flex;
    flex-direction: column;
    gap: 4px;
    margin-top: var(--gap-inline);
    max-width: 360px;
  }

  .resume__bar {
    height: 3px;
    border-radius: var(--radius-pill);
    background: var(--surface-inset);
    overflow: hidden;
  }

  .resume__bar > span {
    display: block;
    height: 100%;
    background: var(--accent);
  }

  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: var(--gap-inline);
    margin-top: var(--gap-row);
  }

  .block {
    display: flex;
    flex-direction: column;
    gap: var(--gap-row);
    max-width: 900px;
  }

  .block__tabs {
    align-self: flex-start;
  }

  .clamped {
    display: -webkit-box;
    -webkit-line-clamp: 6;
    line-clamp: 6;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }

  .chips {
    display: flex;
    flex-wrap: wrap;
    gap: var(--gap-tight);
  }

  .chip {
    padding: 2px 8px;
    border-radius: var(--radius-pill);
    background: var(--surface-raised);
    border: 1px solid var(--hairline);
    font-size: var(--text-xs);
    color: var(--text-secondary);
  }

  .rows {
    display: flex;
    flex-direction: column;
    gap: 1px;
    list-style: none;
  }

  .row {
    display: flex;
    align-items: center;
    gap: var(--gap-row);
    width: 100%;
    padding: var(--gap-inline) var(--gap-row);
    border-radius: var(--radius-sm);
    text-align: left;
    color: var(--text-secondary);
  }

  .row:hover {
    background: var(--surface-raised);
  }

  .row--static:hover {
    background: transparent;
  }

  .row__index {
    flex: 0 0 28px;
    color: var(--text-tertiary);
    font-size: var(--text-xs);
  }

  .row__body {
    display: flex;
    flex-direction: column;
    gap: 1px;
    min-width: 0;
    flex: 1 1 auto;
  }

  .row__title {
    font-size: var(--text-sm);
    color: var(--text);
  }

  .form-error {
    color: var(--danger);
  }

  .editor {
    padding: var(--gap-panel);
    border-radius: var(--radius-md);
    border: 1px solid var(--hairline);
    background: var(--surface);
  }

  .editor__grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
    gap: var(--gap-row);
  }

  .editor__actions {
    display: flex;
    gap: var(--gap-inline);
  }
</style>
