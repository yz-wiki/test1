<script lang="ts">
  import { library, progress, ui } from '../lib/state.svelte';
  import { episodesNewestFirst, player } from '../lib/player.svelte';
  import { preloadPinyin, textMatches } from '../lib/search';
  import { t, formatDuration, type TranslationKey } from '../lib/i18n.svelte';
  import Cover from '../components/Cover.svelte';
  import Icon from '../components/Icon.svelte';

  type Filter = 'all' | 'unplayed' | 'progress' | 'finished';

  const FILTERS: { id: Filter; key: TranslationKey }[] = [
    { id: 'all', key: 'podcast.filterAll' },
    { id: 'unplayed', key: 'podcast.filterUnplayed' },
    { id: 'progress', key: 'podcast.filterProgress' },
    { id: 'finished', key: 'podcast.filterFinished' },
  ];

  let filter = $state<Filter>('all');
  let query = $state('');
  let pinyinReady = $state(false);

  const item = $derived(library.items.find(entry => entry.id === ui.itemId) ?? null);
  const meta = $derived(item?.media?.metadata);
  const episodes = $derived(episodesNewestFirst(item));

  function stateOf(episodeId: string): 'unplayed' | 'progress' | 'finished' {
    if (item && progress.for(item.id, episodeId)?.isFinished) return 'finished';
    if (item && progress.fraction(item.id, episodeId) > 0) return 'progress';
    return 'unplayed';
  }

  const visible = $derived.by(() => {
    void pinyinReady;
    const needle = query.trim();
    return episodes.filter(episode => {
      if (filter !== 'all' && stateOf(episode.id) !== filter) return false;
      if (!needle) return true;
      return textMatches(`${episode.title} ${episode.subtitle ?? ''}`, needle);
    });
  });

  /** What the header button should do: resume what is half-listened, else the
   *  newest unplayed one, else just the newest. */
  const upNext = $derived(
    episodes.find(episode => stateOf(episode.id) === 'progress')
      ?? episodes.find(episode => stateOf(episode.id) === 'unplayed')
      ?? episodes[0]
      ?? null,
  );

  const upNextVerb = $derived(
    upNext && stateOf(upNext.id) === 'progress' ? t('podcast.resume') : t('podcast.play'),
  );

  function play(episodeId: string): void {
    if (!item) return;
    const episode = episodes.find(entry => entry.id === episodeId);
    if (!episode) return;
    void player.open(item, episode, episodes);
  }

  function date(episode: { publishedAt?: number; pubDate?: string }): string {
    const value = episode.publishedAt
      ?? (episode.pubDate ? Date.parse(episode.pubDate) : 0);
    if (!value) return '';
    return new Date(value).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  }
</script>

{#if item}
  <div class="page scroll-y">
    <button class="btn btn--quiet btn--sm" onclick={() => (ui.route = 'library')}>
      <Icon name="chevron-left" size={14} />
      {t('podcast.back')}
    </button>

    <header class="head">
      <div class="head__cover">
        <Cover itemId={item.id} size={360} radius="var(--radius-md)" title={meta?.title ?? ''} />
      </div>

      <div class="head__text">
        <span class="t-label">{t('podcast.episodes', { count: episodes.length })}</span>
        <h1 class="t-title clamp-2">{meta?.title ?? item.id}</h1>
        <p class="t-secondary truncate">{meta?.authorName ?? ''}</p>
        {#if meta?.description}
          <p class="t-small t-tertiary clamp-3">{meta.description}</p>
        {/if}

        {#if upNext}
          <button class="btn btn--primary btn--sm head__play" onclick={() => play(upNext.id)}>
            <Icon name="play" size={14} />
            {upNextVerb}
          </button>
        {/if}
      </div>
    </header>

    <div class="toolbar">
      <div class="search" style="width: 280px">
        <span class="search__icon"><Icon name="search" size={14} /></span>
        <input
          class="input"
          bind:value={query}
          placeholder={t('podcast.search')}
          spellcheck="false"
          onfocus={() => void preloadPinyin().then(() => (pinyinReady = true))}
        />
      </div>

      <div class="segmented">
        {#each FILTERS as entry (entry.id)}
          <button
            class="segmented__item"
            aria-pressed={filter === entry.id}
            onclick={() => (filter = entry.id)}
          >{t(entry.key)}</button>
        {/each}
      </div>
    </div>

    {#if visible.length === 0}
      <div class="empty">
        <Icon name="headphones" size={26} />
        <span class="empty__title">{t('podcast.empty')}</span>
        <span class="empty__body">{t('podcast.emptyHint')}</span>
      </div>
    {:else}
      <ul class="episodes">
        {#each visible as episode (episode.id)}
          {@const state = stateOf(episode.id)}
          {@const fraction = progress.fraction(item.id, episode.id)}
          {@const current = player.item?.id === item.id && player.episode?.id === episode.id}
          <li>
            <button
              class="episode"
              class:current
              onclick={() => play(episode.id)}
            >
              <span class="episode__play">
                <Icon name={current && player.playing ? 'pause' : 'play'} size={14} />
              </span>

              <span class="episode__body">
                <span class="episode__top">
                  <span class="truncate episode__title">{episode.title}</span>
                  {#if state === 'finished'}
                    <span class="tag tag--done">{t('podcast.finished')}</span>
                  {:else if state === 'progress'}
                    <span class="tag">{t('podcast.inProgress')}</span>
                  {/if}
                </span>

                {#if episode.subtitle}
                  <span class="t-small t-tertiary truncate">{episode.subtitle}</span>
                {/if}

                <span class="episode__meta t-num t-small t-tertiary">
                  <span>{date(episode)}</span>
                  <span>{formatDuration(episode.duration ?? 0)}</span>
                  {#if fraction > 0 && state !== 'finished'}
                    <span class="episode__remain">
                      {t('player.progressOf', {
                        done: formatDuration((episode.duration ?? 0) * fraction),
                        total: formatDuration(episode.duration ?? 0),
                      })}
                    </span>
                  {/if}
                </span>

                {#if fraction > 0 && state !== 'finished'}
                  <span class="episode__bar" aria-hidden="true">
                    <span style:width="{fraction * 100}%"></span>
                  </span>
                {/if}
              </span>
            </button>
          </li>
        {/each}
      </ul>
    {/if}
  </div>
{:else}
  <div class="empty">
    <span class="empty__title">{t('library.error')}</span>
    <button class="btn btn--sm" onclick={() => (ui.route = 'library')}>{t('podcast.back')}</button>
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
    width: 180px;
    height: 180px;
    flex: 0 0 180px;
    border-radius: var(--radius-md);
    overflow: hidden;
    box-shadow: var(--shadow-2);
  }

  .head__text {
    display: flex;
    flex-direction: column;
    gap: var(--gap-tight);
    min-width: 0;
    max-width: 720px;
  }

  .head__play {
    align-self: flex-start;
    margin-top: var(--gap-inline);
  }

  .toolbar {
    display: flex;
    align-items: center;
    gap: var(--gap-panel);
    flex-wrap: wrap;
  }

  .episodes {
    display: flex;
    flex-direction: column;
    gap: 2px;
    list-style: none;
  }

  .episode {
    display: flex;
    gap: var(--gap-row);
    width: 100%;
    padding: var(--gap-row);
    border-radius: var(--radius-sm);
    text-align: left;
    color: var(--text-secondary);
    transition: background var(--dur-1) var(--ease);
  }

  .episode:hover {
    background: var(--surface-raised);
  }

  .episode.current {
    background: var(--accent-soft);
    color: var(--text);
  }

  .episode__play {
    display: grid;
    place-items: center;
    width: 28px;
    height: 28px;
    flex: 0 0 28px;
    margin-top: 2px;
    border-radius: 50%;
    border: 1px solid var(--hairline-strong);
    color: var(--text);
  }

  .episode__body {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
    flex: 1 1 auto;
  }

  .episode__top {
    display: flex;
    align-items: center;
    gap: var(--gap-inline);
    min-width: 0;
  }

  .episode__title {
    font-size: var(--text-sm);
    color: var(--text);
    font-weight: var(--weight-medium);
  }

  .episode__meta {
    display: flex;
    gap: var(--gap-row);
  }

  .episode__remain {
    color: var(--accent);
  }

  .episode__bar {
    display: block;
    height: 2px;
    margin-top: 4px;
    border-radius: var(--radius-pill);
    background: var(--surface-inset);
    overflow: hidden;
  }

  .episode__bar > span {
    display: block;
    height: 100%;
    background: var(--accent);
  }

  .tag {
    flex: 0 0 auto;
    padding: 1px 7px;
    border-radius: var(--radius-pill);
    background: var(--accent-soft);
    color: var(--accent);
    font-size: var(--text-2xs);
    font-weight: var(--weight-medium);
  }

  .tag--done {
    background: var(--surface-inset);
    color: var(--text-tertiary);
  }
</style>
