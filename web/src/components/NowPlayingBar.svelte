<script lang="ts">
  /**
   * The transport bar reads left to right as three questions: *what* is
   * playing, *where* in it am I, and *what can I change*.
   *
   * It used to answer the second question four times over — `5:48`,
   * `本章剩余 11:11`, `全书 1%`, `剩 16:59:20` — which is why the row felt
   * loud and unreadable at the same time. The bar now owns exactly three
   * numbers: elapsed in chapter, length of chapter, percent of book. The
   * chapter list is no longer a separate icon either; the chapter count *is*
   * the button that opens it.
   */
  import { onMount } from 'svelte';
  import { player } from '../lib/player.svelte';
  import { t, formatDuration } from '../lib/i18n.svelte';
  import Cover from './Cover.svelte';
  import Icon from './Icon.svelte';
  import Dropdown from './Dropdown.svelte';
  import SeekBar from './SeekBar.svelte';

  const item = $derived(player.item);
  const chapters = $derived(player.chapters);

  /**
   * The bar's one draggable track measures the *chapter*, not the book.
   * A 189-hour title moves a whole-book playhead by one pixel an hour, and the
   * thousand-tick chapter ruler on top of it read as a dashed line rather than
   * as information.
   */
  const chapterLength = $derived(player.chapter ? player.chapter.end - player.chapter.start : 0);
  const chapterPos = $derived(
    player.chapter ? Math.max(player.position - player.chapter.start, 0) : player.position,
  );
  const chapterFraction = $derived(
    chapterLength > 0 ? Math.min(Math.max(chapterPos / chapterLength, 0), 1) : player.progress,
  );

  function seekChapter(fraction: number): void {
    const chapter = player.chapter;
    if (!chapter || chapterLength <= 0) {
      void player.seekFraction(fraction);
      return;
    }
    void player.seek(chapter.start + fraction * chapterLength);
  }

  let jumpOpen = $state(false);
  let jumpEl = $state<HTMLDivElement | null>(null);
  let jumpList = $state<HTMLDivElement | null>(null);
  let jumpQuery = $state('');
  let sleepOpen = $state(false);
  let volumeActive = $state(false);
  let volumeTimer: ReturnType<typeof setTimeout> | null = null;
  let lastVolume = $state(1);

  /** A start that happened behind the shelf still has to be visible. */
  let flash = $state(false);
  let flashTimer: ReturnType<typeof setTimeout> | null = null;
  $effect(() => {
    const at = player.announcedAt;
    if (!at) return;
    flash = true;
    if (flashTimer) clearTimeout(flashTimer);
    flashTimer = setTimeout(() => (flash = false), 1400);
  });

  const RATES = ['0.8', '1', '1.25', '1.5', '1.75', '2'];
  const SLEEPS = [15, 30, 45, 60] as const;

  function onVolume(value: number): void {
    void player.setVolume(value);
    volumeActive = true;
    if (volumeTimer) clearTimeout(volumeTimer);
    volumeTimer = setTimeout(() => (volumeActive = false), 1200);
  }

  function toggleMute(): void {
    if (player.volume > 0) {
      lastVolume = player.volume;
      void player.setVolume(0);
    } else {
      void player.setVolume(lastVolume || 0.8);
    }
  }

  /** Chapters for a book, episodes for a show — one list, whichever applies. */
  const entries = $derived(
    player.kind === 'episode'
      ? player.queue.map((episode, index) => ({
          key: episode.id,
          n: episode.index ?? player.queue.length - index,
          title: episode.title,
          at: episode.duration ?? 0,
          current: episode.id === player.episode?.id,
          jump: () => void player.open(item!, episode, player.queue, undefined, false),
        }))
      : chapters.map((chapter, index) => ({
          key: `c${index}`,
          n: index + 1,
          title: chapter.title,
          at: chapter.start,
          current: index === player.chapterIndex,
          jump: () => void player.seek(chapter.start),
        })),
  );

  /** 1 274 rows do not need a filter box; the scroll list is enough. */
  const searchable = $derived(entries.length > 60);
  const shown = $derived.by(() => {
    const query = jumpQuery.trim().toLowerCase();
    if (!query) return entries;
    return entries.filter(entry => entry.title.toLowerCase().includes(query));
  });

  /** Opening the list on chapter 900 should not dump you on chapter 1. */
  $effect(() => {
    if (!jumpOpen) return;
    const row = jumpList?.querySelector('[data-current="true"]');
    row?.scrollIntoView({ block: 'center' });
  });

  const jumpLabel = $derived(
    player.kind === 'episode'
      ? t('player.episodeNow', { index: entries.findIndex(entry => entry.current) + 1, total: entries.length })
      : t('player.chapterNow', { index: Math.max(player.chapterIndex, 0) + 1, total: chapters.length }),
  );

  onMount(() => {
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as HTMLElement | null;
      if (jumpOpen && jumpEl && !jumpEl.contains(event.target as Node)) jumpOpen = false;
      if (sleepOpen && !target?.closest('.bar__pop-anchor')) sleepOpen = false;
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      jumpOpen = false;
      sleepOpen = false;
    };
    window.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('keydown', onKey);
    };
  });
</script>

{#if item}
  <div class="bar" class:flash>
    <button class="bar__meta" onclick={() => player.expand()} title={t('player.expand')}>
      <div class="bar__cover">
        <Cover itemId={item.id} size={96} title={player.showTitle} />
      </div>
      <div class="bar__text">
        <span class="truncate bar__title">{player.title}</span>
        {#if flash}
          <span class="truncate t-small bar__started">{t('player.started')}</span>
        {:else}
          <span class="truncate t-small t-tertiary">{player.subtitle}</span>
        {/if}
      </div>
    </button>

    <div class="bar__center">
      <div class="bar__transport">
        <button
          type="button"
          class="icon-btn icon-btn--sm"
          aria-label={t('player.prevChapter')}
          title={t('player.prevChapter')}
          onclick={() => void player.step(-1)}
          disabled={!player.canStepBack}
        >
          <Icon name="skip-back" />
        </button>

        <button
          type="button"
          class="bar__play"
          aria-label={player.playing ? t('player.pause') : t('player.play')}
          title={player.playing ? t('player.pause') : t('player.play')}
          onclick={() => void player.toggle()}
          disabled={player.loading}
        >
          <Icon name={player.playing ? 'pause' : 'play'} size={16} />
        </button>

        <button
          type="button"
          class="icon-btn icon-btn--sm"
          aria-label={t('player.nextChapter')}
          title={t('player.nextChapter')}
          onclick={() => void player.step(1)}
          disabled={!player.canStepForward}
        >
          <Icon name="skip-forward" />
        </button>
      </div>

      <div class="bar__seek">
        <span class="bar__t t-num">{formatDuration(chapterPos)}</span>
        <SeekBar
          value={chapterFraction}
          size="sm"
          label={t('player.progressOf', {
            done: formatDuration(chapterPos),
            total: formatDuration(chapterLength || player.duration),
          })}
          onSeek={seekChapter}
          disabled={player.duration <= 0}
        />
        <span class="bar__t bar__t--total t-num">
          {formatDuration(chapterLength || player.duration)}
        </span>
      </div>
    </div>

    <div class="bar__right">
      {#if entries.length > 0}
        <div class="bar__anchored" bind:this={jumpEl}>
          <button
            type="button"
            class="bar__chip"
            aria-haspopup="dialog"
            aria-expanded={jumpOpen}
            title={player.chapter?.title ?? ''}
            onclick={() => {
              jumpOpen = !jumpOpen;
              jumpQuery = '';
            }}
          >
            <span class="bar__chip-text t-num">{jumpLabel}</span>
            <span class="bar__chip-caret"><Icon name="chevron-down" size={11} /></span>
          </button>

          {#if jumpOpen}
            <div class="jump" role="dialog" aria-label={t('player.chapters')}>
              <div class="jump__head">
                <span class="t-label">
                  {player.kind === 'episode' ? t('podcast.episodes', { count: entries.length }) : t('player.chapters')}
                </span>
                {#if searchable}
                  <input
                    class="input jump__search"
                    bind:value={jumpQuery}
                    placeholder={t('player.chapterSearch')}
                    spellcheck="false"
                  />
                {/if}
              </div>
              <div class="jump__list" bind:this={jumpList}>
                {#each shown as entry (entry.key)}
                  <button
                    type="button"
                    class="jump__item"
                    data-current={entry.current ? 'true' : undefined}
                    aria-current={entry.current ? 'true' : undefined}
                    onclick={() => {
                      entry.jump();
                      jumpOpen = false;
                    }}
                  >
                    <span class="jump__n t-num">{entry.n}</span>
                    <span class="truncate jump__title">{entry.title}</span>
                    <span class="t-num t-small t-tertiary">{formatDuration(entry.at)}</span>
                  </button>
                {/each}
                {#if shown.length === 0}
                  <p class="jump__empty t-small t-tertiary">{t('player.noChapters')}</p>
                {/if}
              </div>
            </div>
          {/if}
        </div>

        {#if player.kind === 'book'}
          <span
            class="bar__book t-num"
            title={t('player.progressOf', {
              done: formatDuration(player.position),
              total: formatDuration(player.duration),
            })}
          >
            {t('player.bookProgress', { pct: Math.round(player.progress * 100) })}
          </span>
        {/if}
      {/if}

      <span class="bar__sep"></span>

      <div class="bar__volume">
        <button
          type="button"
          class="icon-btn icon-btn--sm"
          aria-label={player.volume > 0 ? t('player.mute') : t('player.unmute')}
          title={player.volume > 0 ? t('player.mute') : t('player.unmute')}
          onclick={toggleMute}
        ><Icon name="volume" size={14} /></button>
        <input
          class="bar__slider"
          type="range"
          min="0"
          max="1"
          step="0.02"
          value={player.volume}
          style="--fill: {player.volume * 100}%"
          aria-label={t('player.volume')}
          oninput={event => onVolume(Number(event.currentTarget.value))}
        />
        <span class="bar__pct t-num" class:shown={volumeActive}>{Math.round(player.volume * 100)}%</span>
      </div>

      <Dropdown
        value={String(player.rate)}
        options={RATES.map(rate => ({ value: rate, label: `${rate}×` }))}
        onSelect={next => void player.setRate(Number(next))}
        label={t('player.speed')}
        placement="up"
      />

      <div class="bar__pop-anchor">
        <button
          type="button"
          class="icon-btn icon-btn--sm"
          class:active={sleepOpen || player.sleepMode !== 'off'}
          aria-label={t('player.sleepShort')}
          title={t('player.sleepShort')}
          aria-expanded={sleepOpen}
          onclick={() => (sleepOpen = !sleepOpen)}
        ><Icon name="clock" size={14} /></button>
        {#if sleepOpen}
          <div class="bar__pop" role="menu">
            <button type="button" class="bar__pop-item" onclick={() => { player.setSleep('off'); sleepOpen = false; }}>
              {t('sleep.off')}
            </button>
            {#each SLEEPS as minutes (minutes)}
              <button type="button" class="bar__pop-item" onclick={() => { player.setSleep(minutes); sleepOpen = false; }}>
                {t('sleep.minutes', { count: minutes })}
              </button>
            {/each}
            <button type="button" class="bar__pop-item" onclick={() => { player.setSleep('chapter'); sleepOpen = false; }}>
              {t('sleep.chapter')}
            </button>
          </div>
        {/if}
      </div>

      <button
        type="button"
        class="icon-btn icon-btn--sm"
        aria-label={t('player.openPlayer')}
        title={t('player.openPlayer')}
        onclick={() => player.expand()}
      ><Icon name="expand" size={14} /></button>
    </div>
  </div>
{/if}

<style>
  .bar {
    display: flex;
    align-items: center;
    gap: var(--gap-row);
    height: 72px;
    flex: 0 0 auto;
    border-top: 1px solid var(--hairline);
    background: var(--surface);
    padding-inline: var(--gap-block);
    transition: background-color var(--dur-2) var(--ease);
  }

  /* Starting a title in place: the bar lights up instead of the screen moving. */
  .bar.flash {
    background: var(--accent-soft);
  }

  /* ── 1. What is playing ──────────────────────────────────────────────── */

  .bar__meta {
    display: flex;
    align-items: center;
    gap: var(--gap-inline);
    flex: 0 1 232px;
    min-width: 132px;
    padding: 4px;
    margin-left: -4px;
    border-radius: var(--radius-sm);
    text-align: left;
  }

  .bar__meta:hover {
    background: var(--surface-raised);
  }

  .bar__cover {
    width: 40px;
    height: 40px;
    flex: 0 0 40px;
    border-radius: var(--radius-xs);
    overflow: hidden;
  }

  .bar__text {
    display: flex;
    flex-direction: column;
    gap: 1px;
    min-width: 0;
  }

  .bar__title {
    font-size: var(--text-sm);
    font-weight: var(--weight-medium);
    color: var(--text);
    line-height: 1.3;
  }

  .bar__started {
    color: var(--accent);
    font-weight: var(--weight-medium);
  }

  /* ── 2. Where am I ───────────────────────────────────────────────────── */

  .bar__center {
    display: flex;
    align-items: center;
    gap: var(--gap-row);
    flex: 1 1 auto;
    min-width: 0;
  }

  .bar__transport {
    display: flex;
    align-items: center;
    gap: 2px;
    flex: 0 0 auto;
  }

  .bar__play {
    display: grid;
    place-items: center;
    width: 34px;
    height: 34px;
    margin-inline: 2px;
    border-radius: 50%;
    background: var(--accent);
    color: var(--on-accent);
    box-shadow: 0 2px 10px var(--accent-soft);
    transition: background var(--dur-1) var(--ease), transform var(--dur-1) var(--ease);
  }

  .bar__play:hover:not(:disabled) {
    background: var(--accent-hover);
  }

  .bar__play:active:not(:disabled) {
    transform: scale(0.96);
  }

  .bar__play:disabled {
    opacity: 0.6;
  }

  .bar__seek {
    display: flex;
    align-items: center;
    gap: 10px;
    flex: 1 1 auto;
    min-width: 120px;
  }

  .bar__seek :global(.seek) {
    flex: 1 1 auto;
    min-width: 0;
  }

  /* 10.5px at 42% opacity was the "看不清" part. Times are now 12px, full
     strength for the playhead and 55% for the endpoint, both tabular. */
  .bar__t {
    flex: 0 0 auto;
    min-width: 34px;
    font-size: var(--text-xs);
    font-weight: var(--weight-medium);
    font-variant-numeric: tabular-nums;
    color: var(--text-secondary);
    letter-spacing: 0.01em;
  }

  .bar__t--total {
    text-align: right;
    color: var(--text-tertiary);
  }

  /* ── 3. What can I change ────────────────────────────────────────────── */

  .bar__right {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 2px;
    flex: 0 0 auto;
  }

  .bar__anchored {
    position: relative;
  }

  /* The chapter count is the chapter list button. One control, one meaning. */
  .bar__chip {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    height: var(--control-sm);
    padding: 0 6px 0 9px;
    border-radius: var(--radius-sm);
    color: var(--text-secondary);
    font-size: var(--text-xs);
    font-weight: var(--weight-medium);
    white-space: nowrap;
    transition: background var(--dur-1) var(--ease), color var(--dur-1) var(--ease);
  }

  .bar__chip:hover,
  .bar__chip[aria-expanded='true'] {
    background: var(--surface-raised);
    color: var(--text);
  }

  .bar__chip-caret {
    display: inline-flex;
    color: var(--text-tertiary);
    transition: transform var(--dur-2) var(--ease);
  }

  .bar__chip[aria-expanded='true'] .bar__chip-caret {
    transform: rotate(180deg);
  }

  /* The only other "important" number in the bar, kept quieter than the
     chapter so the eye still lands on the draggable track first. */
  .bar__book {
    flex: 0 0 auto;
    padding-left: 2px;
    font-size: var(--text-2xs);
    color: var(--text-tertiary);
    white-space: nowrap;
  }

  .bar__sep {
    width: 1px;
    height: 18px;
    margin-inline: 6px;
    background: var(--hairline);
  }

  .bar__volume {
    display: flex;
    align-items: center;
    gap: 2px;
  }

  .bar__slider {
    width: 64px;
  }

  .bar__pct {
    min-width: 30px;
    font-size: var(--text-2xs);
    color: var(--text-tertiary);
    opacity: 0;
    transition: opacity var(--dur-2) var(--ease);
  }

  .bar__pct.shown {
    opacity: 1;
  }

  .bar__pop-anchor {
    position: relative;
  }

  .bar__pop {
    position: absolute;
    right: 0;
    bottom: calc(100% + 8px);
    z-index: 20;
    display: flex;
    flex-direction: column;
    min-width: 132px;
    padding: 4px;
    border-radius: var(--radius-sm);
    border: 1px solid var(--hairline-strong);
    background: var(--surface-overlay);
    box-shadow: var(--shadow-2);
  }

  .bar__pop-item {
    padding: 6px 10px;
    border-radius: var(--radius-xs);
    text-align: left;
    font-size: var(--text-xs);
    color: var(--text-secondary);
  }

  .bar__pop-item:hover {
    background: var(--accent-soft);
    color: var(--accent);
  }

  .icon-btn.active {
    color: var(--accent);
  }

  /* ── Chapter list ────────────────────────────────────────────────────── */

  .jump {
    position: absolute;
    bottom: calc(100% + 10px);
    right: 0;
    z-index: 40;
    width: 320px;
    display: flex;
    flex-direction: column;
    border-radius: var(--radius-md);
    background: var(--surface-overlay);
    border: 1px solid var(--hairline-strong);
    box-shadow: var(--shadow-3);
    overflow: hidden;
  }

  .jump__head {
    display: flex;
    flex-direction: column;
    gap: var(--gap-inline);
    padding: var(--gap-inline) var(--gap-row);
    border-bottom: 1px solid var(--hairline);
    color: var(--text-tertiary);
  }

  .jump__search {
    height: var(--control-sm);
    font-size: var(--text-xs);
  }

  .jump__list {
    max-height: 320px;
    overflow-y: auto;
    padding: var(--gap-hair);
  }

  /* A 1 274-row list scrolls fine, but laying out every row on open does not.
     `content-visibility` lets the engine skip what is off screen without a
     windowing implementation of our own. */
  .jump__item {
    display: flex;
    align-items: center;
    gap: var(--gap-row);
    width: 100%;
    padding: var(--gap-inline) var(--gap-row);
    border-radius: var(--radius-xs);
    text-align: left;
    color: var(--text-secondary);
    font-size: var(--text-sm);
    content-visibility: auto;
    contain-intrinsic-size: auto 32px;
  }

  .jump__item:hover {
    background: var(--surface-raised);
    color: var(--text);
  }

  .jump__item[aria-current='true'] {
    background: var(--accent-soft);
    color: var(--accent);
    font-weight: var(--weight-medium);
  }

  .jump__n {
    flex: 0 0 30px;
    text-align: right;
    color: var(--text-tertiary);
    font-size: var(--text-xs);
  }

  .jump__item[aria-current='true'] .jump__n {
    color: var(--accent);
  }

  .jump__title {
    flex: 1 1 auto;
  }

  .jump__empty {
    padding: var(--gap-row);
  }

  /* ── Narrow windows: drop information, never squeeze it ──────────────── */

  @media (max-width: 1320px) {
    .bar__book {
      display: none;
    }
  }

  @media (max-width: 1160px) {
    .bar__slider {
      width: 44px;
    }
    .bar__meta {
      flex-basis: 190px;
    }
  }

  @media (max-width: 1040px) {
    .bar__volume {
      display: none;
    }
  }
</style>
