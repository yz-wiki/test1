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
      if (event.key === 'Escape' && open) {
        open = false;
        event.preventDefault();
      }
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
    onclick={toggle}
  >
    <Icon name="device" size={14} />
    {#if showLabel}
      <span class="devpick__label truncate">{audioDevices.label}</span>
    {/if}
  </button>

  {#if open}
    <div class="devpick__menu" class:up={placement === 'up'} role="listbox" aria-label={t('player.device')}>
      <div class="devpick__head">
        <span class="devpick__head-title t-label">{t('player.device')}</span>
        <span class="devpick__head-current truncate t-small t-tertiary">{audioDevices.label}</span>
      </div>
      <div class="devpick__list">
        {#each audioDevices.devices as device (device.id)}
          {@const active = device.id === audioDevices.current}
          <button
            type="button"
            class="devpick__item"
            class:active
            role="option"
            aria-selected={active}
            onclick={() => {
              void audioDevices.choose(device.id);
              open = false;
            }}
          >
            <span class="devpick__icon"><Icon name={device.id ? 'volume' : 'device'} size={14} /></span>
            <span class="devpick__text">
              <span class="truncate">{device.name}</span>
              {#if !device.id}<span class="t-small t-tertiary">{t('settings.audioDefault')}</span>{/if}
            </span>
            <span class="devpick__check" aria-hidden="true">
              {#if active}<Icon name="check" size={13} />{/if}
            </span>
          </button>
        {/each}
      </div>
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

  /* A device sheet, not a context menu: one head line naming the current
     output, then full-width rows with a leading icon well and a trailing
     check column. No native tooltip on the trigger (it used to hang under
     this panel and duplicate the head line). */
  .devpick__menu {
    position: absolute;
    right: 0;
    top: calc(100% + 8px);
    z-index: 75;
    display: flex;
    flex-direction: column;
    width: 272px;
    max-width: calc(100vw - 32px);
    padding: 6px;
    border-radius: var(--radius-md);
    border: 1px solid var(--hairline-strong);
    background: var(--surface-overlay);
    box-shadow: var(--shadow-3), 0 10px 28px rgb(0 0 0 / 0.12);
  }

  .devpick__menu.up {
    top: auto;
    bottom: calc(100% + 8px);
  }

  .devpick__head {
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: 6px 10px 10px;
    border-bottom: 1px solid var(--hairline);
    margin-bottom: 4px;
  }

  .devpick__head-title {
    color: var(--text-tertiary);
  }

  .devpick__head-current {
    font-size: var(--text-sm);
    font-weight: var(--weight-medium);
    color: var(--text);
  }

  .devpick__list {
    display: flex;
    flex-direction: column;
    gap: 2px;
    max-height: 260px;
    overflow-y: auto;
  }

  .devpick__item {
    display: flex;
    align-items: center;
    gap: 10px;
    width: 100%;
    min-width: 0;
    padding: 7px 8px;
    border-radius: var(--radius-sm);
    text-align: left;
    font-size: var(--text-sm);
    color: var(--text-secondary);
  }

  .devpick__item:hover {
    background: var(--surface-raised);
    color: var(--text);
  }

  .devpick__item.active {
    background: var(--accent-soft);
    color: var(--accent);
    font-weight: var(--weight-medium);
  }

  .devpick__icon {
    display: grid;
    place-items: center;
    width: 28px;
    height: 28px;
    flex: 0 0 28px;
    border-radius: var(--radius-xs);
    background: var(--surface-inset);
    color: var(--text-tertiary);
  }

  .devpick__item.active .devpick__icon {
    background: var(--accent);
    color: var(--on-accent);
  }

  .devpick__text {
    display: flex;
    flex: 1 1 auto;
    flex-direction: column;
    gap: 1px;
    min-width: 0;
  }

  .devpick__check {
    display: grid;
    place-items: center;
    width: 16px;
    flex: 0 0 16px;
    color: var(--accent);
  }

  .devpick__empty {
    padding: 8px 10px;
    margin: 0;
  }
</style>
