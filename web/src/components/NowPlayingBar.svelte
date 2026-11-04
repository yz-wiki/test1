<script lang="ts">
  import { player } from '../lib/player.svelte';
  import { t, formatDuration } from '../lib/i18n.svelte';
  import Cover from './Cover.svelte';
  import Icon from './Icon.svelte';
  import SeekBar from './SeekBar.svelte';

  const item = $derived(player.item);
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
    />

    <div class="bar__row">
      <button
        class="bar__meta"
        onclick={() => player.expand()}
        title={t('player.expand')}
      >
        <div class="bar__cover">
          <Cover itemId={item.id} size={96} />
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
        <button
          class="icon-btn icon-btn--sm"
          aria-label={t('player.expand')}
          title={t('player.expand')}
          onclick={() => player.expand()}
        >
          <Icon name="expand" />
        </button>
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
</style>
