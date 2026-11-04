<script lang="ts">
  import { onMount } from 'svelte';
  import { player } from '../lib/player.svelte';
  import { t, formatDuration } from '../lib/i18n.svelte';
  import Cover from './Cover.svelte';
  import Icon from './Icon.svelte';
  import SeekBar from './SeekBar.svelte';

  const item = $derived(player.item);
  const chapters = $derived(player.chapters);

  const marks = $derived(
    player.duration > 0
      ? chapters
          .map(chapter => chapter.start / player.duration)
          .filter(fraction => fraction > 0.002 && fraction < 0.998)
      : [],
  );

  let menuOpen = $state(false);
  let menuEl = $state<HTMLDivElement | null>(null);

  /** Chapters for a book, episodes for a show — one list, whichever applies. */
  const entries = $derived(
    player.kind === 'episode'
      ? player.queue.map((episode, index) => ({
          key: episode.id,
          n: episode.index ?? player.queue.length - index,
          title: episode.title,
          at: episode.duration ?? 0,
          current: episode.id === player.episode?.id,
          jump: () => void player.open(item!, episode, player.queue),
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
      if (!menuOpen) return;
      if (menuEl && !menuEl.contains(event.target as Node)) menuOpen = false;
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') menuOpen = false;
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
  <div class="bar">
    <SeekBar
      value={player.progress}
      size="sm"
      label={t('player.progressOf', {
        done: formatDuration(player.position),
        total: formatDuration(player.duration),
      })}
      onSeek={fraction => void player.seekFraction(fraction)}
      disabled={player.duration <= 0}
      {marks}
    />

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
          <span class="truncate t-small t-tertiary">{player.subtitle}</span>
        </div>
      </button>

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

      <div class="bar__right">
        <span class="t-num t-small t-tertiary bar__time">
          {formatDuration(player.position)} / {formatDuration(player.duration)}
        </span>
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
  }

  .bar__row {
    display: flex;
    align-items: center;
    gap: var(--gap-panel);
    height: 62px;
  }

  .bar__meta {
    display: flex;
    align-items: center;
    gap: var(--gap-row);
    flex: 1 1 0;
    min-width: 0;
    text-align: left;
    border-radius: var(--radius-sm);
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
    gap: var(--gap-inline);
    flex: 1 1 0;
    min-width: 0;
  }

  .bar__time {
    white-space: nowrap;
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
