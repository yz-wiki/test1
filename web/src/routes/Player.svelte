<script lang="ts">
  import { createBookmark } from '../lib/ipc';
  import { progress, session } from '../lib/state.svelte';
  import { player, RATES } from '../lib/player.svelte';
  import { t, formatDuration } from '../lib/i18n.svelte';
  import Cover from '../components/Cover.svelte';
  import Icon from '../components/Icon.svelte';
  import SeekBar from '../components/SeekBar.svelte';
  import ProgressLine from '../components/ProgressLine.svelte';
  import Dropdown from '../components/Dropdown.svelte';

  /** The blurb lives beside the cover and folds; it is not a tab. */
  let tab = $state<'chapters' | 'bookmarks'>('chapters');
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
  const shownTab = $derived(isEpisode ? 'chapters' : tab);

  /**
   * Bookmarks belong on the whole-book line, not on the chapter track: their
   * times are book-wide, so drawing them over a chapter-scale rail would place
   * a mark for chapter 12 somewhere in the middle of chapter 37.
   */
  const bookmarkFractions = $derived(
    player.duration > 0 ? marks.map(mark => mark.time / player.duration) : [],
  );

  /** Chapters that hold a bookmark, so the list can flag them in place. */
  const flaggedChapters = $derived.by(() => {
    const set = new Set<number>();
    for (const mark of marks) {
      const index = chapters.findIndex(chapter => mark.time >= chapter.start && mark.time < chapter.end);
      if (index >= 0) set.add(index);
    }
    return set;
  });

  /**
   * A 1 274-chapter book wants one list you can scroll and type into, not a
   * range picker that makes you guess which hundred your chapter lives in.
   * `content-visibility: auto` keeps off-screen rows out of layout.
   */
  let chapterQuery = $state('');
  const shownChapters = $derived.by(() => {
    const query = chapterQuery.trim().toLowerCase();
    return chapters
      .map((chapter, index) => ({ chapter, index }))
      .filter(row => !query || row.chapter.title.toLowerCase().includes(query));
  });

  function jumpToCurrent(): void {
    const index = Math.max(player.chapterIndex, 0);
    chapterQuery = '';
    requestAnimationFrame(() => {
      listEl?.querySelector<HTMLElement>(`[data-chapter="${index}"]`)
        ?.scrollIntoView({ block: 'center' });
    });
  }

  /** Which chapter a bookmark falls in — the list says "1:12:30 · 第 12 集"
   *  instead of a bare timestamp the listener cannot place. */
  function chapterOfMark(time: number): string {
    return chapters.find(chapter => time >= chapter.start && time < chapter.end)?.title ?? '';
  }

  // Follow the playhead: when a new title opens or the chapter changes, put it
  // in view instead of leaving the list at chapter 1.
  let listEl = $state<HTMLDivElement | null>(null);
  $effect(() => {
    const index = player.chapterIndex;
    if (!listEl || index < 0 || chapterQuery.trim()) return;
    const row = listEl.querySelector<HTMLElement>(`[data-chapter="${index}"]`);
    row?.scrollIntoView({ block: 'center' });
  });

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
        <div class="stage__head">
          <div class="stage__cover">
            <Cover itemId={item.id} size={560} radius="var(--radius-lg)" title={player.showTitle} />
          </div>

          <div class="stage__info">
            <h1 class="t-title clamp-2">{player.title}</h1>
            <p class="t-secondary truncate">{isEpisode ? player.showTitle : (meta?.authorName ?? '')}</p>
            {#if facts.length > 0}
              <p class="t-small t-tertiary truncate">{facts.join('  ·  ')}</p>
            {/if}

            {#if description}
              <p class="stage__desc">{description}</p>
            {/if}

            {#if meta?.genres?.length}
              <div class="stage__genres">
                {#each meta.genres as genre (genre)}
                  <span class="chip">{genre}</span>
                {/each}
              </div>
            {/if}
          </div>
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
            <span class="transport__t">{formatDuration(chapterPos)}</span>
            {#if chapterLine}
              <span class="transport__chapter truncate">{chapterLine}</span>
            {/if}
            <span class="transport__t">
              {formatDuration(chapterLength || player.duration)}
            </span>
          </div>

          {#if !isEpisode && chapters.length > 1}
            <div class="book-bar">
              <span class="book-bar__tag t-small t-tertiary">{t('player.wholeBook')}</span>
              <ProgressLine
                value={player.progress}
                label={t('player.bookProgress', { pct: Math.round(player.progress * 100) })}
                marks={bookmarkFractions}
              />
              <span class="book-bar__pct t-small t-num t-secondary">
                {Math.round(player.progress * 100)}%
              </span>
            </div>
          {/if}


          <div class="transport__extras">
            <span class="t-label tools__label">{t('player.speed')}</span>
            <Dropdown
              value={String(player.rate)}
              options={RATES.map(rate => ({ value: String(rate), label: `${rate}×` }))}
              onSelect={next => void player.setRate(Number(next))}
              label={t('player.speed')}
              variant="field"
            />

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
              >{t('player.bookmarks')}{#if marks.length > 0}<span class="segmented__count t-num">{marks.length}</span>{/if}</button>
            </div>
          </div>
        {/if}

        {#if shownTab === 'chapters'}
          {#if isEpisode}
            <div class="chapter-list scroll-y">
              {#each player.queue as entry, index (entry.id)}
                <button
                  class="chapter"
                  aria-current={entry.id === player.episode?.id ? 'true' : undefined}
                  onclick={() => void player.open(item!, entry, player.queue, undefined, false)}
                >
                  <span class="chapter__index t-num">{entry.index ?? player.queue.length - index}</span>
                  <span class="chapter__body">
                    <span class="truncate chapter__title">{entry.title}</span>
                    <span class="t-small t-num t-tertiary">{formatDuration(entry.duration ?? 0)}</span>
                  </span>
                  {#if entry.id === player.episode?.id}
                    <span class="chapter__dot" aria-hidden="true"></span>
                  {/if}
                </button>
              {/each}
              {#if player.queue.length === 0}
                <p class="t-small t-tertiary" style="padding: var(--gap-row)">{t('podcast.empty')}</p>
              {/if}
            </div>
          {:else}
          {#if chapters.length > 1}
            <div class="chapter-tools">
              <span class="t-small t-tertiary t-num">
                {t('player.chapterCount', { count: chapters.length })}
              </span>
              <div class="chapter-tools__right">
                {#if chapters.length > 60}
                  <input
                    class="input chapter-search"
                    bind:value={chapterQuery}
                    placeholder={t('player.chapterSearch')}
                    spellcheck="false"
                  />
                {/if}
                <button class="btn btn--quiet btn--sm" onclick={jumpToCurrent}>
                  {t('book.jumpToCurrent')}
                </button>
              </div>
            </div>
          {/if}

          <div class="chapter-list scroll-y" bind:this={listEl}>
            {#if chapters.length === 0}
              <p class="t-small t-tertiary" style="padding: var(--gap-row)">
                {player.chaptersLoading ? t('player.loadingChapters') : t('player.noChapters')}
              </p>
            {:else}
              {#each shownChapters as row (row.chapter.start)}
                {@const chapter = row.chapter}
                {@const index = row.index}
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
                  {#if flaggedChapters.has(index)}
                    <span class="chapter__flag" aria-hidden="true" title={t('player.bookmarks')}></span>
                  {/if}
                  {#if index === player.chapterIndex}
                    <span class="chapter__dot" aria-hidden="true"></span>
                  {/if}
                </button>
              {/each}
            {/if}
          </div>
          {/if}
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
                    <span class="chapter__flag" aria-hidden="true"></span>
                    <span class="chapter__body">
                      <span class="truncate chapter__title">{mark.title}</span>
                      <span class="t-small t-num t-tertiary">
                        {formatDuration(mark.time)}{#if chapterOfMark(mark.time)} · {chapterOfMark(mark.time)}{/if}
                      </span>
                    </span>
                  </button>
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

  /* Cover and blurb share one band: the description is context for the title,
     not a separate document worth a tab of its own. */
  .stage__head {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    align-items: start;
    gap: var(--gap-section);
    width: 100%;
    max-width: 620px;
  }

  .stage__cover {
    width: min(228px, 32vh);
    aspect-ratio: 1;
    border-radius: var(--radius-lg);
    overflow: hidden;
    box-shadow: var(--shadow-3);
  }

  .stage__info {
    display: flex;
    flex-direction: column;
    gap: var(--gap-hair);
    min-width: 0;
    padding-top: var(--gap-inline);
  }

  /* Fixed share of the viewport, not a fold/unfold button: the blurb always
     occupies the same space, and long text scrolls inside that space. */
  .stage__desc {
    margin-top: var(--gap-inline);
    max-height: 30vh;
    padding-right: 4px;
    overflow-y: auto;
    overscroll-behavior: contain;
    color: var(--text-secondary);
    font-size: var(--text-sm);
    line-height: 1.6;
  }

  .stage__genres {
    display: flex;
    flex-wrap: wrap;
    gap: var(--gap-tight);
    margin-top: var(--gap-inline);
  }

  @media (max-width: 900px) {
    .stage__head {
      grid-template-columns: minmax(0, 1fr);
      justify-items: center;
      text-align: center;
    }

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

  .book-bar {
    display: flex;
    align-items: center;
    gap: var(--gap-inline);
    margin-top: var(--gap-inline);
  }

  .book-bar__tag {
    flex: 0 0 auto;
    white-space: nowrap;
  }

  .book-bar__pct {
    flex: 0 0 auto;
    min-width: 30px;
    text-align: right;
  }

  /* 10.5 px at 42% was unreadable. Both endpoints are now 12 px, tabular,
     and at full secondary strength; the middle line names the chapter. */
  .transport__times {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: var(--gap-row);
    font-size: var(--text-xs);
    color: var(--text-secondary);
  }

  .transport__t {
    flex: 0 0 auto;
    font-size: var(--text-xs);
    font-weight: var(--weight-medium);
    font-variant-numeric: tabular-nums;
    color: var(--text-secondary);
  }

  .transport__chapter {
    flex: 1 1 auto;
    text-align: center;
    color: var(--text);
    font-size: var(--text-sm);
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

  .chapter-tools {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--gap-inline);
    padding-bottom: var(--gap-inline);
  }

  .chapter-tools__right {
    display: flex;
    align-items: center;
    gap: 4px;
    min-width: 0;
  }

  .chapter-search {
    width: 116px;
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
    content-visibility: auto;
    contain-intrinsic-size: auto 44px;
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

  /* A bookmark sits in the chapter list as a flag, so "where did I mark this"
     is answerable without opening the bookmarks tab. */
  .chapter__flag {
    width: 7px;
    height: 9px;
    flex: 0 0 auto;
    background: var(--accent);
    opacity: 0.8;
    clip-path: polygon(0 0, 100% 0, 100% 100%, 50% 70%, 0 100%);
  }

  .segmented__count {
    margin-left: 4px;
    padding: 0 5px;
    border-radius: var(--radius-pill);
    background: var(--surface-inset);
    font-size: var(--text-2xs);
    color: var(--text-secondary);
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

  .chip {
    padding: 2px 8px;
    border-radius: var(--radius-pill);
    background: var(--surface-raised);
    border: 1px solid var(--hairline);
    font-size: var(--text-xs);
    color: var(--text-secondary);
  }
</style>
