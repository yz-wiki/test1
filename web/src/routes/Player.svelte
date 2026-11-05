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
  /** Shows the percentage only while the volume slider is in use. */
  let volumeActive = $state(false);
  let volumeTimer: ReturnType<typeof setTimeout> | null = null;
  let lastVolume = $state(1);

  function toggleMute(): void {
    if (player.volume > 0) {
      lastVolume = player.volume;
      void player.setVolume(0);
    } else {
      void player.setVolume(lastVolume || 0.8);
    }
  }

  function onVolumeInput(value: number): void {
    void player.setVolume(value);
    volumeActive = true;
    if (volumeTimer) clearTimeout(volumeTimer);
    volumeTimer = setTimeout(() => (volumeActive = false), 1200);
  }
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

  /** Thousands of chapters cannot all be mounted; show one range at a time. */
  const CHUNK = 100;
  let chapterPage = $state(0);
  const chapterRanges = $derived(Math.max(1, Math.ceil(chapters.length / CHUNK)));
  const shownChapters = $derived(
    chapters.slice(chapterPage * CHUNK, (chapterPage + 1) * CHUNK),
  );

  // Follow the playhead: when a new title opens or the chapter changes, put it
  // in view instead of leaving the list at chapter 1.
  let listEl = $state<HTMLDivElement | null>(null);
  $effect(() => {
    const index = player.chapterIndex;
    if (!listEl || index < 0 || chapters.length <= CHUNK) return;
    const page = Math.floor(index / CHUNK);
    if (page !== chapterPage) {
      chapterPage = page;
      return;
    }
    const row = listEl.querySelector<HTMLElement>(`[data-chapter="${index}"]`);
    row?.scrollIntoView({ block: 'center' });
  });

  const chapterMarks = $derived(
    player.duration > 0
      ? chapters
          .map(chapter => chapter.start / player.duration)
          .filter(fraction => fraction > 0.002 && fraction < 0.998)
      : [],
  );

  /** The transport's main bar measures the current chapter, not the book: a
   *  189-hour title otherwise moves its playhead by one pixel an hour. */
  const chapterLength = $derived(player.chapter ? player.chapter.end - player.chapter.start : 0);
  const chapterPos = $derived(
    player.chapter ? Math.max(player.position - player.chapter.start, 0) : player.position,
  );
  const chapterFraction = $derived(
    chapterLength > 0
      ? Math.min(Math.max(chapterPos / chapterLength, 0), 1)
      : player.progress,
  );

  function seekChapter(fraction: number): void {
    const chapter = player.chapter;
    if (!chapter || chapterLength <= 0) {
      void player.seekFraction(fraction);
      return;
    }
    void player.seek(chapter.start + fraction * chapterLength);
  }

  /** "12 / 189 · 第十二章" — where you are, in chapter terms. */
  const chapterLine = $derived.by(() => {
    if (isEpisode || chapters.length === 0) return '';
    const index = Math.max(player.chapterIndex, 0);
    const name = player.chapter?.title ?? '';
    return `${index + 1} / ${chapters.length}${name ? ` · ${name}` : ''}`;
  });

  const chapterTitleNow = $derived(player.chapter?.title ?? '');

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
          <Cover itemId={item.id} size={560} radius="var(--radius-lg)" title={player.showTitle} />
        </div>

        <div class="stage__titles">
          <h1 class="t-title clamp-2">{player.title}</h1>
          <p class="t-secondary truncate">{isEpisode ? player.showTitle : (meta?.authorName ?? '')}</p>
          {#if facts.length > 0}
            <p class="t-small t-tertiary truncate">{facts.join('  ·  ')}</p>
          {/if}
        </div>

        <div class="transport">
          <div class="transport__top">
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

            <div class="transport__volume">
              <button
                class="icon-btn icon-btn--sm"
                aria-label={player.volume > 0 ? t('player.mute') : t('player.unmute')}
                title={player.volume > 0 ? t('player.mute') : t('player.unmute')}
                onclick={toggleMute}
              ><Icon name="volume" size={14} /></button>
              <input
                class="volume"
                type="range"
                min="0"
                max="1"
                step="0.02"
                value={player.volume}
                style="--fill: {player.volume * 100}%"

                aria-label={t('player.volume')}
                oninput={event => onVolumeInput(Number(event.currentTarget.value))}
              />
              <span class="volume__value t-num" class:shown={volumeActive}>
                {Math.round(player.volume * 100)}%
              </span>
            </div>
          </div>

          <SeekBar
            value={chapterFraction}
            size="lg"
            label={t('player.progressOf', {
              done: formatDuration(chapterPos),
              total: formatDuration(chapterLength || player.duration),
            })}
            onSeek={seekChapter}
            disabled={player.duration <= 0}
          />
          <div class="transport__times t-num t-small t-tertiary">
            <span>{formatDuration(chapterPos)}</span>
            {#if chapterLine}
              <span class="transport__chapter truncate">{chapterLine}</span>
            {/if}
            <span>
              −{formatDuration(Math.max((chapterLength || player.duration) - chapterPos, 0))}
            </span>
          </div>

          {#if !isEpisode && chapters.length > 1}
            <div class="book-bar">
              <SeekBar
                value={player.progress}
                size="sm"
                label={t('player.wholeBook')}
                onSeek={fraction => void player.seekFraction(fraction)}
                marks={chapterMarks}
              />
              <div class="book-bar__legend t-small t-tertiary t-num">
                <span>{formatDuration(player.position)}</span>
                <span class="book-bar__label">
                  {#if !isEpisode && chapters.length > 0}
                    {t('player.chapterNow', { index: Math.max(player.chapterIndex, 0) + 1, total: chapters.length })}
                    · {chapterTitleNow}
                    · {t('player.bookProgress', { pct: Math.round(player.progress * 100) })}
                  {:else}
                    {t('player.bookProgress', { pct: Math.round(player.progress * 100) })}
                  {/if}
                </span>
                <span>−{formatDuration(Math.max(player.duration - player.position, 0))}</span>
              </div>
            </div>
          {/if}


          <div class="transport__extras">
            <span class="t-label tools__label">{t('player.speed')}</span>
            <div class="segmented">
              {#each RATES as rate (rate)}
                <button
                  class="segmented__item"
                  aria-pressed={player.rate === rate}
                  onclick={() => void player.setRate(rate)}
                >{rate}×</button>
              {/each}
            </div>

            <span class="tools__divider"></span>

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
          {#if chapters.length > CHUNK}
            <div class="chapter-range">
              <span class="t-small t-tertiary t-num">
                {t('book.chapterRange', {
                  from: chapterPage * CHUNK + 1,
                  to: Math.min((chapterPage + 1) * CHUNK, chapters.length),
                  total: chapters.length,
                })}
              </span>
              <select
                class="select"
                value={chapterPage}
                onchange={event => (chapterPage = Number(event.currentTarget.value))}
              >
                {#each Array(chapterRanges) as _, index (index)}
                  <option value={index}>
                    {index * CHUNK + 1}–{Math.min((index + 1) * CHUNK, chapters.length)}
                  </option>
                {/each}
              </select>
            </div>
          {/if}

          <div class="chapter-list scroll-y" bind:this={listEl}>
            {#if chapters.length === 0}
              <p class="t-small t-tertiary" style="padding: var(--gap-row)">
                {player.chaptersLoading ? t('player.loadingChapters') : t('player.noChapters')}
              </p>
            {:else}
              {#each shownChapters as chapter, offset (chapter.start)}
                {@const index = chapterPage * CHUNK + offset}
                <button
                  class="chapter"
                  data-chapter={index}
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

  /* Controls sit above the progress now, with volume sharing their row. */
  .transport__top {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 58px;
    margin-bottom: var(--gap-inline);
  }

  .transport__volume {
    position: absolute;
    right: 0;
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .book-bar :global(.seek__fill) {
    opacity: 0.55;
  }

  .transport__times {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: var(--gap-row);
  }

  .transport__chapter {
    flex: 1 1 auto;
    text-align: center;
    color: var(--text);
    font-size: var(--text-sm);
    font-weight: var(--weight-medium);
  }

  .book-bar {
    display: flex;
    flex-direction: column;
    gap: 2px;
    margin-top: var(--gap-inline);
    opacity: 0.85;
  }

  .book-bar__legend {
    display: flex;
    justify-content: space-between;
    font-size: var(--text-2xs);
  }

  .book-bar__label {
    letter-spacing: 0.02em;
    color: var(--text-secondary);
    font-weight: var(--weight-medium);
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

  /* One centred tool strip instead of three loose clusters fighting the
     transport buttons for alignment. */
  .transport__extras {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: var(--gap-panel);
    flex-wrap: wrap;
    margin-top: var(--gap-inline);
    padding: var(--gap-inline) var(--gap-row);
    border-radius: var(--radius-md);
    border: 1px solid var(--hairline);
    background: var(--surface);
  }

  .extra {
    display: flex;
    align-items: center;
    gap: var(--gap-inline);
    min-width: 0;
  }

  .volume {
    width: 88px;
  }

  .tools__label {
    color: var(--text-tertiary);
    white-space: nowrap;
  }

  .tools__divider {
    width: 1px;
    height: 18px;
    background: var(--hairline);
  }

  .volume__value {
    min-width: 38px;
    font-size: var(--text-xs);
    color: var(--text-secondary);
    opacity: 0;
    transition: opacity var(--dur-2) var(--ease);
  }

  .volume__value.shown {
    opacity: 1;
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

  .chapter-range {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--gap-inline);
    padding-bottom: var(--gap-inline);
  }

  .chapter-range .select {
    width: 120px;
    height: var(--control-sm);
    font-size: var(--text-xs);
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
