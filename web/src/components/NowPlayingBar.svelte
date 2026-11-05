<script lang="ts">
  import { onMount } from 'svelte';
  import { player } from '../lib/player.svelte';
  import { t, formatDuration } from '../lib/i18n.svelte';
  import Cover from './Cover.svelte';
  import Icon from './Icon.svelte';
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

  let menuOpen = $state(false);
  let menuEl = $state<HTMLDivElement | null>(null);
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

  const RATES = [0.8, 1, 1.25, 1.5, 1.75, 2];
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

  onMount(() => {
    const onPointerDown = (event: PointerEvent) => {
      if (menuOpen && menuEl && !menuEl.contains(event.target as Node)) menuOpen = false;
      const target = event.target as HTMLElement | null;
      if (sleepOpen && !target?.closest('.bar__pop-anchor')) sleepOpen = false;
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        menuOpen = false;
        sleepOpen = false;
      }
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
    <div class="bar__row">
      <button
        class="bar__meta"
        onclick={() => player.expand()}
        title={t('player.expand')}
      >
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
          class="icon-btn icon-btn--sm"
          aria-label={t('player.prevChapter')}
          title={t('player.prevChapter')}
          onclick={() => void player.step(-1)}
          disabled={!player.canStepBack}
        >
          <Icon name="skip-back" />
        </button>

        <button
          class="bar__play"
          aria-label={player.playing ? t('player.pause') : t('player.play')}
          title={player.playing ? t('player.pause') : t('player.play')}
          onclick={() => void player.toggle()}
          disabled={player.loading}
        >
          <Icon name={player.playing ? 'pause' : 'play'} size={16} />
        </button>

        <button
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
          <span class="bar__t t-num">
            {t('player.chapterLeft', {
              time: formatDuration(Math.max((chapterLength || player.duration) - chapterPos, 0)),
            })}
          </span>
        </div>
      </div>

      <div class="bar__right">
        <div class="bar__facts t-num">
          {#if player.kind === 'book' && player.chapters.length > 0}
            <span class="bar__fact">
              {t('player.chapterNow', { index: Math.max(player.chapterIndex, 0) + 1, total: player.chapters.length })}
            </span>
            <span class="bar__fact bar__fact--dim">
              {t('player.bookProgress', { pct: Math.round(player.progress * 100) })}
              · {t('player.bookLeft', { time: formatDuration(Math.max(player.duration - player.position, 0)) })}
            </span>
          {:else}
            <span class="bar__fact">{formatDuration(player.position)} / {formatDuration(player.duration)}</span>
          {/if}
        </div>

        <div class="bar__volume">
          <button
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

        <select
          class="select select--xs"
          aria-label={t('player.speed')}
          title={t('player.speed')}
          value={player.rate}
          onchange={event => void player.setRate(Number(event.currentTarget.value))}
        >
          {#each RATES as rate (rate)}
            <option value={rate}>{rate}×</option>
          {/each}
        </select>

        <div class="bar__pop-anchor">
          <button
            class="icon-btn icon-btn--sm"
            class:active={sleepOpen || player.sleepMode !== 'off'}
            aria-label={t('player.sleepShort')}
            title={t('player.sleepShort')}
            aria-expanded={sleepOpen}
            onclick={() => (sleepOpen = !sleepOpen)}
          ><Icon name="clock" size={14} /></button>
          {#if sleepOpen}
            <div class="bar__pop" role="menu">
              <button class="bar__pop-item" onclick={() => { player.setSleep('off'); sleepOpen = false; }}>
                {t('sleep.off')}
              </button>
              {#each SLEEPS as minutes (minutes)}
                <button class="bar__pop-item" onclick={() => { player.setSleep(minutes); sleepOpen = false; }}>
                  {t('sleep.minutes', { count: minutes })}
                </button>
              {/each}
              <button class="bar__pop-item" onclick={() => { player.setSleep('chapter'); sleepOpen = false; }}>
                {t('sleep.chapter')}
              </button>
            </div>
          {/if}
        </div>

        <button
          class="icon-btn icon-btn--sm"
          aria-label={t('player.openPlayer')}
          title={t('player.openPlayer')}
          onclick={() => player.expand()}
        ><Icon name="expand" size={14} /></button>

        <div class="bar__menu-anchor" bind:this={menuEl}>
          <button
            class="icon-btn icon-btn--sm"
            aria-label={t('player.jumpTo')}
            title={t('player.jumpTo')}
            aria-expanded={menuOpen}
            onclick={() => (menuOpen = !menuOpen)}
          >
            <Icon name="list" />
          </button>

          {#if menuOpen}
            <div class="jump" role="menu">
              <div class="jump__head t-label">
                {player.kind === 'episode' ? t('podcast.episodes', { count: entries.length }) : t('player.chapters')}
              </div>
              <div class="jump__list">
                {#each entries as entry (entry.key)}
                  <button
                    class="jump__item"
                    role="menuitem"
                    aria-current={entry.current ? 'true' : undefined}
                    onclick={() => {
                      entry.jump();
                      menuOpen = false;
                    }}
                  >
                    <span class="jump__n t-num">{entry.n}</span>
                    <span class="truncate jump__title">{entry.title}</span>
                    <span class="t-num t-small t-tertiary">{formatDuration(entry.at)}</span>
                  </button>
                {/each}
                {#if entries.length === 0}
                  <p class="jump__empty t-small t-tertiary">{t('player.noChapters')}</p>
                {/if}
              </div>
            </div>
          {/if}
        </div>
      </div>
    </div>
  </div>
{/if}

<style>
  .bar {
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

  .bar__started {
    color: var(--accent);
    font-weight: var(--weight-medium);
  }

  .bar__row {
    display: flex;
    align-items: center;
    gap: var(--gap-row);
    height: 72px;
  }

  .bar__meta {
    display: flex;
    align-items: center;
    gap: var(--gap-row);
    flex: 0 1 240px;
    min-width: 148px;
    text-align: left;
    border-radius: var(--radius-sm);
  }

  .bar__center {
    display: flex;
    flex: 1 1 auto;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 3px;
    min-width: 0;
    max-width: 620px;
    margin-inline: auto;
  }

  .bar__seek {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
  }

  .bar__seek :global(.seek) {
    flex: 1 1 auto;
    min-width: 0;
  }

  .bar__t {
    flex: 0 0 auto;
    font-size: var(--text-2xs);
    color: var(--text-tertiary);
    white-space: nowrap;
  }

  .bar__facts {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 1px;
    flex: 0 0 auto;
    line-height: 1.3;
    white-space: nowrap;
  }

  .bar__fact {
    font-size: var(--text-2xs);
    color: var(--text-secondary);
  }

  .bar__fact--dim {
    color: var(--text-tertiary);
  }

  .bar__cover {
    width: 38px;
    height: 38px;
    flex: 0 0 38px;
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
  }

  .bar__volume {
    display: flex;
    align-items: center;
    gap: 2px;
  }

  .bar__slider {
    width: 68px;
  }

  .bar__pct {
    min-width: 32px;
    font-size: var(--text-2xs);
    color: var(--text-tertiary);
    opacity: 0;
    transition: opacity var(--dur-2) var(--ease);
  }

  .bar__pct.shown {
    opacity: 1;
  }

  .select--xs {
    width: auto;
    height: var(--control-sm);
    min-width: 58px;
    padding-inline: 4px;
    font-size: var(--text-xs);
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

  .bar__transport {
    display: flex;
    align-items: center;
    gap: var(--gap-tight);
    flex: 0 0 auto;
  }

  .bar__play {
    display: grid;
    place-items: center;
    width: 34px;
    height: 34px;
    border-radius: 50%;
    background: var(--accent);
    color: var(--on-accent);
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

  .bar__right {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 4px;
    flex: 1 1 0;
    min-width: 0;
  }

  .bar__menu-anchor {
    position: relative;
    display: flex;
  }

  .jump {
    position: absolute;
    bottom: calc(100% + 8px);
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
    padding: var(--gap-inline) var(--gap-row);
    border-bottom: 1px solid var(--hairline);
    color: var(--text-tertiary);
  }

  .jump__list {
    max-height: 320px;
    overflow-y: auto;
    padding: var(--gap-hair);
  }

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
  }

  .jump__item:hover {
    background: var(--surface-raised);
    color: var(--text);
  }

  .jump__item[aria-current='true'] {
    background: var(--accent-soft);
    color: var(--accent);
  }

  .jump__n {
    flex: 0 0 30px;
    text-align: right;
    color: var(--text-tertiary);
    font-size: var(--text-xs);
  }

  .jump__title {
    flex: 1 1 auto;
  }

  .jump__empty {
    padding: var(--gap-row);
  }
</style>
