<script lang="ts">
  /**
   * Quick playback-device switch.
   *
   * Lives next to the volume control (the same "quick actions" grouping iOS
   * and macOS volume replacements use) in the bottom bar and on the expanded
   * player. Settings keeps the full device list; both write the same store, so
   * switching here is immediately reflected there.
   */
  import { onMount } from 'svelte';
  import { audioDevices } from '../lib/audioDevice.svelte';
  import { t } from '../lib/i18n.svelte';
  import Icon from './Icon.svelte';

  let {
    placement = 'up',
    showLabel = false,
  }: { placement?: 'up' | 'down'; showLabel?: boolean } = $props();

  let open = $state(false);
  let root = $state<HTMLDivElement | null>(null);

  function toggle(): void {
    open = !open;
    if (open) void audioDevices.refresh();
  }

  onMount(() => {
    void audioDevices.refresh();
    const onPointer = (event: PointerEvent) => {
      if (open && root && !root.contains(event.target as Node)) open = false;
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') open = false;
    };
    window.addEventListener('pointerdown', onPointer, true);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('pointerdown', onPointer, true);
      window.removeEventListener('keydown', onKey);
    };
  });
</script>

<div class="devpick" bind:this={root}>
  <button
    type="button"
    class="devpick__btn icon-btn icon-btn--sm"
    class:active={open}
    aria-haspopup="listbox"
    aria-expanded={open}
    aria-label="{t('player.device')} · {audioDevices.label}"
    title="{t('player.device')} · {audioDevices.label}"
    onclick={toggle}
  >
    <Icon name="device" size={14} />
    {#if showLabel}
      <span class="devpick__label truncate">{audioDevices.label}</span>
    {/if}
  </button>

  {#if open}
    <div class="devpick__menu" class:up={placement === 'up'} role="listbox" aria-label={t('player.device')}>
      <div class="devpick__head t-label">{t('player.device')}</div>
      {#each audioDevices.devices as device (device.id)}
        <button
          type="button"
          class="devpick__item hl"
          role="option"
          aria-selected={device.id === audioDevices.current}
          onclick={() => {
            void audioDevices.choose(device.id);
            open = false;
          }}
        >
          <Icon name={device.id === audioDevices.current ? 'check' : 'volume'} size={13} />
          <span class="truncate">{device.name}</span>
        </button>
      {/each}
      {#if audioDevices.devices.length <= 1}
        <p class="devpick__empty t-small t-tertiary">{t('player.noDevices')}</p>
      {/if}
    </div>
  {/if}
</div>

<style>
  .devpick {
    position: relative;
    display: inline-flex;
    min-width: 0;
  }

  .devpick__btn {
    display: inline-flex;
    align-items: center;
    gap: 5px;
  }

  .devpick__btn.active {
    color: var(--accent);
  }

  .devpick__label {
    max-width: 96px;
    font-size: var(--text-xs);
  }

  .devpick__menu {
    position: absolute;
    right: 0;
    top: calc(100% + 8px);
    z-index: 60;
    display: flex;
    flex-direction: column;
    min-width: 208px;
    max-width: 280px;
    padding: 5px;
    border-radius: var(--radius-sm);
    border: 1px solid var(--hairline-strong);
    background: var(--surface-overlay);
    box-shadow: var(--shadow-3);
  }

  .devpick__menu.up {
    top: auto;
    bottom: calc(100% + 8px);
  }

  .devpick__head {
    padding: 4px 8px 6px;
    color: var(--text-tertiary);
  }

  .devpick__item {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    padding: 6px 8px;
    text-align: left;
    font-size: var(--text-xs);
    color: var(--text-secondary);
  }

  .devpick__item[aria-selected='true'] {
    color: var(--accent);
    font-weight: var(--weight-medium);
  }

  .devpick__empty {
    padding: 6px 8px;
    margin: 0;
  }
</style>
