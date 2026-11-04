<script lang="ts">
  import { createBookmark } from '../lib/ipc';
  import { progress, session } from '../lib/state.svelte';
  import { player, RATES } from '../lib/player.svelte';
  import { t, formatDuration } from '../lib/i18n.svelte';
  import Cover from '../components/Cover.svelte';
  import Icon from '../components/Icon.svelte';
  import SeekBar from '../components/SeekBar.svelte';

  let tab = $state<'chapters' | 'bookmarks' | 'details'>('chapters');
  let sleepOpen = $state(false);
  let markLabel = $state('');
  let markError = $state<string | null>(null);

  async function addMark(): Promise<void> {
    if (!item || !session.serverUrl) return;
    markError = null;
    try {
      await createBookmark(
        session.serverUrl,
        item.id,
        player.position,
        markLabel.trim() || formatDuration(player.position),
      );
      markLabel = '';
      await progress.load(session.serverUrl, true);
    } catch (reason) {
      markError = (reason as Error).message;
    }
  }

  const SLEEP_CHOICES = [15, 30, 45, 60] as const;

  const sleepLabel = $derived.by(() => {
    if (player.sleepMode === 'off') return t('sleep.title');
    if (player.sleepMode === 'chapter') return t('sleep.chapter');
    if (player.sleepRemaining > 0) {
      return t('sleep.remaining', { time: formatDuration(player.sleepRemaining) });
    }
    return t('sleep.title');
  });

  const item = $derived(player.item);
  const meta = $derived(item?.media?.metadata);
  const chapters = $derived(player.chapters);
  const marks = $derived(item ? progress.bookmarksFor(item.id) : []);
  const isEpisode = $derived(player.kind === 'episode');
  const shownTab = $derived(isEpisode ? 'details' : tab);

  const description = $derived(
    isEpisode ? (player.episode?.description ?? '') : (meta?.description ?? ''),
  );

  const facts = $derived(
    isEpisode
      ? [
          player.showTitle,
          player.episode?.publishedAt
            ? new Date(player.episode.publishedAt).toLocaleDateString()
            : '',
        ].filter(Boolean)
      : [
          meta?.narratorName ? t('player.narrator', { name: meta.narratorName }) : '',
          meta?.publisher ? `${t('player.publisher')} · ${meta.publisher}` : '',
          meta?.publishedYear ? `${t('player.year')} · ${meta.publishedYear}` : '',
        ].filter(Boolean),
  );
</script>

{#if item}
  <div class="player">
    <header class="player__head">
      <button class="btn btn--quiet btn--sm" onclick={() => player.collapse()}>
        <Icon name="chevron-down" size={14} />
        {t('player.collapse')}
      </button>
      {#if player.error}
        <span class="t-small player__error" role="alert">{player.error}</span>
      {/if}
    </header>

    <div class="player__body">
      <section class="stage">
        <div class="stage__cover">
          <Cover itemId={item.id} size={560} radius="var(--radius-lg)" />
        </div>

        <div class="stage__titles">
          <h1 class="t-title clamp-2">{player.title}</h1>
          <p class="t-secondary truncate">{isEpisode ? player.showTitle : (meta?.authorName ?? '')}</p>
          {#if facts.length > 0}
            <p class="t-small t-tertiary truncate">{facts.join('  ·  ')}</p>
          {/if}
        </div>

        <div class="transport">
          <SeekBar
            value={player.progress}
            size="lg"
            label={t('player.progressOf', {
              done: formatDuration(player.position),
              total: formatDuration(player.duration),
            })}
            onSeek={fraction => void player.seekFraction(fraction)}
            disabled={player.duration <= 0}
          />
          <div class="transport__times t-num t-small t-tertiary">
            <span>{formatDuration(player.position)}</span>
            <span>−{formatDuration(Math.max(player.duration - player.position, 0))}</span>
          </div>

          <div class="transport__buttons">
            <button
              class="icon-btn"
              aria-label={t('player.prevChapter')}
              title={t('player.prevChapter')}
              onclick={() => void player.step(-1)}
              disabled={!player.canStepBack}
            >
              <Icon name="skip-back" />
            </button>
            <button
              class="icon-btn"
              aria-label={t('player.back30')}
              title={t('player.back30')}
              onclick={() => void player.skip(-30)}
            >
              <span class="t-num t-small">30</span>
            </button>
            <button
              class="transport__play"
              aria-label={player.playing ? t('player.pause') : t('player.play')}
              title={player.playing ? t('player.pause') : t('player.play')}
              onclick={() => void player.toggle()}
              disabled={player.loading}
            >
              <Icon name={player.playing ? 'pause' : 'play'} size={22} />
            </button>
            <button
              class="icon-btn"
              aria-label={t('player.forward30')}
              title={t('player.forward30')}
              onclick={() => void player.skip(30)}
            >
              <span class="t-num t-small">30</span>
            </button>
            <button
              class="icon-btn"
              aria-label={t('player.nextChapter')}
              title={t('player.nextChapter')}
              onclick={() => void player.step(1)}
              disabled={!player.canStepForward}
            >
              <Icon name="skip-forward" />
            </button>
          </div>

          <div class="transport__extras">
            <div class="extra">
              <span class="t-label">{t('player.speed')}</span>
              <div class="segmented">
                {#each RATES as rate (rate)}
                  <button
                    class="segmented__item"
                    aria-pressed={player.rate === rate}
                    onclick={() => void player.setRate(rate)}
                  >{rate}×</button>
                {/each}
              </div>
            </div>

            <div class="extra">
              <span class="t-label"><Icon name="volume" size={14} /> {t('player.volume')}</span>
              <input
                class="volume"
                type="range"
                min="0"
                max="1"
                step="0.02"
                value={player.volume}
                aria-label={t('player.volume')}
                oninput={event => void player.setVolume(Number(event.currentTarget.value))}
              />
            </div>

            <div class="extra extra--sleep">
              <button
                class="btn btn--quiet btn--sm"
                aria-expanded={sleepOpen}
                onclick={() => (sleepOpen = !sleepOpen)}
              >
                <Icon name="clock" size={14} />
                {sleepLabel}
              </button>

              {#if sleepOpen}
                <div class="sleep-menu" role="menu">
                  <button
                    class="sleep-menu__item"
                    aria-pressed={player.sleepMode === 'off'}
                    onclick={() => {
                      player.setSleep('off');
                      sleepOpen = false;
                    }}
                  >{t('sleep.off')}</button>

                  {#each SLEEP_CHOICES as minutes (minutes)}
                    <button
                      class="sleep-menu__item"
                      aria-pressed={player.sleepMode === minutes}
                      onclick={() => {
                        player.setSleep(minutes);
                        sleepOpen = false;
                      }}
                    >{t('sleep.minutes', { count: minutes })}</button>
                  {/each}

                  <button
                    class="sleep-menu__item"
                    aria-pressed={player.sleepMode === 'chapter'}
                    onclick={() => {
                      player.setSleep('chapter');
                      sleepOpen = false;
                    }}
                  >{t('sleep.chapter')}</button>
                </div>
              {/if}
            </div>
          </div>
        </div>
      </section>

      <aside class="side">
        {#if !isEpisode}
          <div class="side__tabs">
            <div class="segmented">
              <button
                class="segmented__item"
                aria-pressed={tab === 'chapters'}
                onclick={() => (tab = 'chapters')}
              >{t('player.chapters')}</button>
              <button
                class="segmented__item"
                aria-pressed={tab === 'bookmarks'}
                onclick={() => (tab = 'bookmarks')}
              >{t('player.bookmarks')}</button>
              <button
                class="segmented__item"
                aria-pressed={tab === 'details'}
                onclick={() => (tab = 'details')}
              >{t('player.details')}</button>
            </div>
          </div>
        {/if}

        {#if shownTab === 'chapters'}
          <div class="chapter-list scroll-y">
            {#if chapters.length === 0}
              <p class="t-small t-tertiary" style="padding: var(--gap-row)">{t('player.noChapters')}</p>
            {:else}
              {#each chapters as chapter, index (index)}
                <button
                  class="chapter"
                  aria-current={index === player.chapterIndex ? 'true' : undefined}
                  onclick={() => void player.seek(chapter.start)}
                >
                  <span class="chapter__index t-num">{index + 1}</span>
                  <span class="chapter__body">
                    <span class="truncate chapter__title">{chapter.title}</span>
                    <span class="t-small t-num t-tertiary">
                      {formatDuration(chapter.start)} · {formatDuration(chapter.end - chapter.start)}
                    </span>
                  </span>
                  {#if index === player.chapterIndex}
                    <span class="chapter__dot" aria-hidden="true"></span>
                  {/if}
                </button>
              {/each}
            {/if}
          </div>
        {:else if shownTab === 'bookmarks'}
          <div class="bookmarks">
            <div class="mark-add">
              <input
                class="input"
                bind:value={markLabel}
                placeholder={t('bookmark.placeholder')}
                onkeydown={event => {
                  if (event.key === 'Enter') void addMark();
                }}
              />
              <button class="btn btn--sm" onclick={() => void addMark()}>{t('bookmark.add')}</button>
            </div>
            {#if markError}
              <p class="t-small player__error" role="alert">{markError}</p>
            {/if}
            {#if marks.length === 0}
              <p class="t-small t-tertiary">{t('bookmark.empty')}</p>
            {:else}
              <div class="chapter-list scroll-y">
                {#each marks as mark (mark.time + mark.title)}
                  <button class="chapter" onclick={() => void player.seek(mark.time)}>
                    <span class="chapter__index t-num">{formatDuration(mark.time)}</span>
                    <span class="chapter__body">
                      <span class="truncate chapter__title">{mark.title}</span>
                    </span>
                  </button>
                {/each}
              </div>
            {/if}
          </div>
        {:else}
          <div class="details scroll-y">
            {#if description}
              <p class="t-body selectable">{description}</p>
            {:else}
              <p class="t-small t-tertiary">{t('common.unknown')}</p>
            {/if}
            {#if meta?.genres?.length}
              <div class="details__genres">
                {#each meta.genres as genre (genre)}
                  <span class="chip">{genre}</span>
                {/each}
              </div>
            {/if}
          </div>
        {/if}
      </aside>
    </div>
  </div>
{/if}

<style>
  .player {
    display: flex;
    flex-direction: column;
    flex: 1 1 auto;
    min-height: 0;
  }

  .player__head {
    display: flex;
    align-items: center;
    gap: var(--gap-row);
    padding: var(--gap-row) var(--gap-block) 0;
  }

  .player__error {
    color: var(--danger);
  }

  .player__body {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 340px;
    gap: var(--gap-section);
    flex: 1 1 auto;
    min-height: 0;
    padding: var(--gap-block);
  }

  .stage {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--gap-block);
    min-width: 0;
    overflow-y: auto;
  }

  .stage__cover {
    width: min(320px, 42vh);
    aspect-ratio: 1;
    border-radius: var(--radius-lg);
    overflow: hidden;
    box-shadow: var(--shadow-3);
  }

  .stage__titles {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--gap-hair);
    text-align: center;
    max-width: 560px;
  }

  .transport {
    width: min(560px, 100%);
    display: flex;
    flex-direction: column;
    gap: var(--gap-hair);
  }

  .transport__times {
    display: flex;
    justify-content: space-between;
  }

  .transport__buttons {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: var(--gap-row);
    margin-block: var(--gap-row);
  }

  .transport__play {
    display: grid;
    place-items: center;
    width: 52px;
    height: 52px;
    border-radius: 50%;
    background: var(--accent);
    color: var(--on-accent);
    transition: background var(--dur-1) var(--ease), transform var(--dur-1) var(--ease);
  }

  .transport__play:hover:not(:disabled) {
    background: var(--accent-hover);
  }

  .transport__play:active:not(:disabled) {
    transform: scale(0.97);
  }

  .transport__play:disabled {
    opacity: 0.6;
  }

  .transport__extras {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--gap-block);
    flex-wrap: wrap;
  }

  .extra {
    display: flex;
    align-items: center;
    gap: var(--gap-inline);
    min-width: 0;
  }

  .volume {
    width: 120px;
    accent-color: var(--accent);
  }

  .extra--sleep {
    position: relative;
  }

  .sleep-menu {
    position: absolute;
    bottom: calc(100% + 6px);
    right: 0;
    z-index: 20;
    display: flex;
    flex-direction: column;
    min-width: 168px;
    padding: var(--gap-hair);
    border-radius: var(--radius-md);
    background: var(--surface-overlay);
    border: 1px solid var(--hairline-strong);
    box-shadow: var(--shadow-2);
  }

  .sleep-menu__item {
    padding: var(--gap-inline) var(--gap-row);
    border-radius: var(--radius-xs);
    text-align: left;
    font-size: var(--text-sm);
    color: var(--text-secondary);
  }

  .sleep-menu__item:hover {
    background: var(--surface-raised);
    color: var(--text);
  }

  .sleep-menu__item[aria-pressed='true'] {
    color: var(--accent);
  }

  .side {
    display: flex;
    flex-direction: column;
    gap: var(--gap-row);
    min-height: 0;
    border-left: 1px solid var(--hairline);
    padding-left: var(--gap-block);
  }

  .side__tabs .segmented {
    width: 100%;
  }

  .side__tabs .segmented__item {
    flex: 1 1 0;
  }

  .chapter-list {
    flex: 1 1 auto;
    min-height: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .chapter {
    display: flex;
    align-items: center;
    gap: var(--gap-row);
    padding: var(--gap-inline) var(--gap-row);
    border-radius: var(--radius-sm);
    text-align: left;
    color: var(--text-secondary);
  }

  .chapter:hover {
    background: var(--surface-raised);
  }

  .chapter[aria-current='true'] {
    background: var(--accent-soft);
    color: var(--text);
  }

  .chapter__index {
    flex: 0 0 24px;
    color: var(--text-tertiary);
    font-size: var(--text-xs);
  }

  .chapter__body {
    display: flex;
    flex-direction: column;
    gap: 1px;
    min-width: 0;
    flex: 1 1 auto;
  }

  .chapter__title {
    font-size: var(--text-sm);
  }

  .chapter__dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--accent);
    flex: 0 0 auto;
  }

  .details {
    flex: 1 1 auto;
    min-height: 0;
    display: flex;
    flex-direction: column;
    gap: var(--gap-row);
  }

  .bookmarks {
    flex: 1 1 auto;
    min-height: 0;
    display: flex;
    flex-direction: column;
    gap: var(--gap-inline);
  }

  .mark-add {
    display: flex;
    gap: var(--gap-inline);
  }

  .mark-add .input {
    flex: 1 1 auto;
  }

  .details__genres {
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
</style>
