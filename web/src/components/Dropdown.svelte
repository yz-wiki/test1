<script lang="ts">
  /**
   * The app's own select.
   *
   * The native `<select>` popup is drawn by the OS: grey hover bar, system
   * font, square corners. Next to the player's rounded controls it looked like
   * a browser artefact dropped into the window. This renders the trigger and
   * the list with the same tokens as every other popover, and keeps the
   * keyboard contract (arrows, Enter, Esc) that a native select gives for free.
   */
  import { onMount } from 'svelte';
  import Icon from './Icon.svelte';

  type Option = string | { value: string; label: string; hint?: string };

  let {
    value,
    options,
    onSelect,
    label = '',
    /** `ghost` sits in a toolbar, `field` looks like an input. */
    variant = 'ghost',
    align = 'end',
    /** The bar lives at the bottom of the window, so its menus open upwards. */
    placement = 'down',
    width = '',
    disabled = false,
  }: {
    value: string;
    options: Option[];
    onSelect: (value: string) => void;
    label?: string;
    variant?: 'ghost' | 'field';
    align?: 'start' | 'end';
    placement?: 'down' | 'up';
    width?: string;
    disabled?: boolean;
  } = $props();

  const rows = $derived(
    options.map(entry => (typeof entry === 'string' ? { value: entry, label: entry } : entry)),
  );
  const current = $derived(rows.find(row => row.value === value)?.label ?? value);

  let open = $state(false);
  let root = $state<HTMLDivElement | null>(null);

  function choose(next: string): void {
    open = false;
    if (next !== value) onSelect(next);
  }

  onMount(() => {
    const onPointer = (event: PointerEvent) => {
      if (open && root && !root.contains(event.target as Node)) open = false;
    };
    const onKey = (event: KeyboardEvent) => {
      if (!open) return;
      if (event.key === 'Escape') {
        open = false;
        return;
      }
      if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
      event.preventDefault();
      const at = rows.findIndex(row => row.value === value);
      const step = event.key === 'ArrowDown' ? 1 : -1;
      const next = rows[Math.min(Math.max(at + step, 0), rows.length - 1)];
      if (next) choose(next.value);
    };
    window.addEventListener('pointerdown', onPointer, true);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('pointerdown', onPointer, true);
      window.removeEventListener('keydown', onKey);
    };
  });
</script>

<div class="drop" class:field={variant === 'field'} bind:this={root}>
  <button
    type="button"
    class="drop__btn"
    aria-haspopup="listbox"
    aria-expanded={open}
    aria-label={label || undefined}
    title={label || undefined}
    {disabled}
    onclick={() => (open = !open)}
  >
    <span class="drop__value">{current}</span>
    <span class="drop__caret"><Icon name="chevron-down" size={11} /></span>
  </button>

  {#if open}
    <div
      class="drop__menu"
      class:start={align === 'start'}
      class:up={placement === 'up'}
      role="listbox"
      style:width={width || undefined}
    >
      {#each rows as row (row.value)}
        <button
          type="button"
          class="drop__item"
          role="option"
          aria-selected={row.value === value}
          onclick={() => choose(row.value)}
        >
          <span class="drop__item-label">{row.label}</span>
          {#if row.hint}<span class="drop__item-hint t-num">{row.hint}</span>{/if}
          {#if row.value === value}<span class="drop__tick"><Icon name="check" size={12} /></span>{/if}
        </button>
      {/each}
    </div>
  {/if}
</div>

<style>
  .drop {
    position: relative;
    display: inline-flex;
    min-width: 0;
  }

  .drop__btn {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    height: var(--control-sm);
    padding: 0 6px 0 8px;
    border-radius: var(--radius-sm);
    color: var(--text-secondary);
    font-size: var(--text-xs);
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
    transition: background var(--dur-1) var(--ease), color var(--dur-1) var(--ease);
  }

  .drop__btn:hover:not(:disabled) {
    background: var(--surface-raised);
    color: var(--text);
  }

  .drop__btn[aria-expanded='true'] {
    background: var(--surface-raised);
    color: var(--text);
  }

  .drop__btn:disabled {
    opacity: 0.45;
  }

  /* A field keeps the outline an input has, so it reads as a value, not a
     command. Toolbars use the ghost shape above. */
  .field .drop__btn {
    height: var(--control-md);
    padding: 0 8px 0 10px;
    border: 1px solid var(--hairline);
    background: var(--surface);
    color: var(--text);
    font-size: var(--text-sm);
  }

  .field .drop__btn:hover:not(:disabled) {
    border-color: var(--hairline-strong);
    background: var(--surface-raised);
  }

  .drop__caret {
    display: inline-flex;
    color: var(--text-tertiary);
    transition: transform var(--dur-2) var(--ease);
  }

  .drop__btn[aria-expanded='true'] .drop__caret {
    transform: rotate(180deg);
  }

  .drop__menu {
    position: absolute;
    top: calc(100% + 6px);
    right: 0;
    z-index: 60;
    display: flex;
    flex-direction: column;
    gap: 1px;
    min-width: 100%;
    max-height: 280px;
    overflow-y: auto;
    padding: 4px;
    border-radius: var(--radius-sm);
    border: 1px solid var(--hairline-strong);
    background: var(--surface-overlay);
    box-shadow: var(--shadow-2);
  }

  .drop__menu.start {
    right: auto;
    left: 0;
  }

  .drop__menu.up {
    top: auto;
    bottom: calc(100% + 6px);
  }

  .drop__item {
    display: flex;
    align-items: center;
    gap: var(--gap-inline);
    width: 100%;
    padding: 6px 8px;
    border-radius: var(--radius-xs);
    text-align: left;
    font-size: var(--text-xs);
    color: var(--text-secondary);
    white-space: nowrap;
  }

  .drop__item:hover {
    background: var(--accent-soft);
    color: var(--accent);
  }

  .drop__item[aria-selected='true'] {
    color: var(--text);
  }

  .drop__item-label {
    flex: 1 1 auto;
  }

  .drop__item-hint {
    color: var(--text-tertiary);
    font-size: var(--text-2xs);
  }

  .drop__tick {
    display: inline-flex;
    color: var(--accent);
  }
</style>
