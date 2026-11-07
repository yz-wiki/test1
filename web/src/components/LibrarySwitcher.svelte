<script lang="ts">
  /**
   * Library switcher.
   *
   * The global context menu is positioned at the pointer and sized for a
   * right-click menu; in a narrow window it drifted over the shelf heading and
   * looked like a stray tooltip. This popover is anchored to its own button,
   * clamped to the viewport, and shows what each library actually is.
   */
  import { onMount } from 'svelte';
  import { session } from '../lib/state.svelte';
  import { t } from '../lib/i18n.svelte';
  import Icon from './Icon.svelte';

  let open = $state(false);
  let root = $state<HTMLDivElement | null>(null);
  let btnEl = $state<HTMLButtonElement | null>(null);

  /** The rail scrolls (`overflow-y: auto`), which clipped this popover the
      moment it opened near the bottom of the list. Fixed coordinates measured
      from the trigger escape that clip and stay inside the window. */
  let popPos = $state({ left: 0, top: 0, width: 220, maxHeight: 320, ready: false });

  function place(): void {
    if (!btnEl) return;
    const rect = btnEl.getBoundingClientRect();
    const margin = 8;
    const vw = document.documentElement.clientWidth;
    const vh = document.documentElement.clientHeight;
    const width = Math.min(280, Math.max(210, vw - 32));
    const left = Math.min(Math.max(margin, rect.left), Math.max(margin, vw - width - margin));
    const top = rect.bottom + 6;
    popPos = {
      left,
      top,
      width,
      maxHeight: Math.max(160, Math.min(320, vh - top - margin)),
      ready: true,
    };
  }

  $effect(() => {
    if (!open) {
      // Never spread `popPos` here: reading the state we are about to write
      // makes this effect its own dependency, and Svelte retries it until it
      // throws `effect_update_depth_exceeded` on every frame.
      popPos = { left: 0, top: 0, width: 220, maxHeight: 320, ready: false };
      return;
    }
    const frame = requestAnimationFrame(place);
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  });

  onMount(() => {
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

  function select(id: string): void {
    session.selectLibrary(id);
    open = false;
  }
</script>

<div class="switcher" bind:this={root}>
  <button
    class="switcher__btn"
    bind:this={btnEl}
    aria-label={t('library.switch')}
    title={t('library.switch')}
    aria-expanded={open}
    onclick={() => (open = !open)}
  >
    <Icon name="library" size={14} />
    <span class="truncate">{session.activeLibrary?.name ?? t('app.name')}</span>
    <Icon name="chevron-down" size={11} />
  </button>

  {#if open}
    <div
      class="pop"
      role="menu"
      style:left="{popPos.left}px"
      style:top="{popPos.top}px"
      style:width="{popPos.width}px"
      style:max-height="{popPos.maxHeight}px"
      style:visibility={popPos.ready ? 'visible' : 'hidden'}
    >
      <div class="pop__head t-label">{t('library.switch')}</div>
      <div class="pop__list scroll-y">
        {#each session.libraries as lib (lib.id)}
          {@const active = lib.id === session.activeLibraryId}
          <button
            class="pop__item"
            class:active
            role="menuitem"
            aria-current={active ? 'true' : undefined}
            onclick={() => select(lib.id)}
          >
            <span class="pop__icon"><Icon name={lib.mediaType === 'podcast' ? 'headphones' : 'book'} size={15} /></span>
            <span class="pop__text">
              <span class="truncate">{lib.name}</span>
              <span class="t-small t-tertiary">
                {lib.mediaType === 'podcast' ? t('nav.nowPlaying') : t('library.books')}
              </span>
            </span>
            {#if active}<Icon name="check" size={14} />{/if}
          </button>
        {/each}
        {#if session.libraries.length === 0}
          <p class="t-small t-tertiary pop__empty">{t('common.unknown')}</p>
        {/if}
      </div>
    </div>
  {/if}
</div>

<style>
  .switcher {
    position: relative;
    min-width: 0;
  }

  .switcher__btn {
    display: flex;
    align-items: center;
    gap: 6px;
    max-width: 200px;
    padding: 5px 8px;
    border-radius: var(--radius-sm);
    border: 1px solid transparent;
    font-size: var(--text-sm);
    font-weight: var(--weight-medium);
    color: var(--text);
  }

  .switcher__btn:hover,
  .switcher__btn[aria-expanded='true'] {
    background: var(--surface-raised);
    border-color: var(--hairline);
  }

  .switcher__btn :global(svg) {
    flex: 0 0 auto;
    color: var(--text-tertiary);
  }

  /* Fixed: the sidebar scrolls, so an absolute popover was clipped by its
     own container. Coordinates come from place(). */
  .pop {
    position: fixed;
    z-index: 80;
    overflow-y: auto;
    padding: 5px;
    border-radius: var(--radius-md);
    border: 1px solid var(--hairline-strong);
    background: var(--surface-overlay);
    box-shadow: var(--shadow-2), 0 8px 24px rgb(0 0 0 / 0.12);
  }

  .pop__head {
    padding: 6px 10px 8px;
    color: var(--text-tertiary);
    font-size: var(--text-2xs);
    letter-spacing: 0.08em;
  }

  .pop__list {
    max-height: min(300px, calc(100vh - 160px));
    overflow-y: auto;
  }

  .pop__item {
    display: flex;
    align-items: center;
    gap: var(--gap-inline);
    width: 100%;
    padding: 8px 10px;
    border-radius: var(--radius-sm);
    text-align: left;
    color: var(--text-secondary);
  }

  .pop__item:hover {
    background: var(--surface-raised);
  }

  .pop__item.active {
    background: var(--accent-soft);
    color: var(--accent);
  }

  .pop__icon {
    display: grid;
    place-items: center;
    width: 28px;
    height: 28px;
    flex: 0 0 28px;
    border-radius: var(--radius-xs);
    background: var(--surface-inset);
  }

  .pop__item.active .pop__icon {
    background: var(--accent-soft);
  }

  .pop__text {
    display: flex;
    flex: 1 1 auto;
    flex-direction: column;
    gap: 1px;
    min-width: 0;
    font-size: var(--text-sm);
  }

  .pop__empty {
    padding: 10px;
  }
</style>
