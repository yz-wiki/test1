<script lang="ts">
  /**
   * One seek surface for the whole app.
   *
   * The bar and the full player differ only in size — same geometry, same
   * keyboard steps, same pointer handling — so the two never drift apart.
   */
  let {
    value,
    onSeek,
    size = 'sm',
    label,
    disabled = false,
    marks = [],
  }: {
    value: number;
    onSeek: (fraction: number) => void;
    size?: 'sm' | 'lg';
    label?: string;
    disabled?: boolean;
    /** Chapter boundaries as 0–1 fractions; drawn as ticks on the track. */
    marks?: number[];
  } = $props();

  let track = $state<HTMLDivElement | null>(null);
  let dragging = $state(false);
  let pending = $state(0);

  const shown = $derived(dragging ? pending : Math.min(Math.max(value, 0), 1));

  function fractionAt(clientX: number): number {
    const box = track?.getBoundingClientRect();
    if (!box || box.width === 0) return 0;
    return Math.min(Math.max((clientX - box.left) / box.width, 0), 1);
  }

  function onPointerDown(event: PointerEvent): void {
    if (disabled || event.button !== 0) return;
    dragging = true;
    pending = fractionAt(event.clientX);
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  }

  function onPointerMove(event: PointerEvent): void {
    if (!dragging) return;
    pending = fractionAt(event.clientX);
  }

  function onPointerUp(event: PointerEvent): void {
    if (!dragging) return;
    const fraction = fractionAt(event.clientX);
    dragging = false;
    (event.currentTarget as HTMLElement).releasePointerCapture?.(event.pointerId);
    onSeek(fraction);
  }

  function onKeyDown(event: KeyboardEvent): void {
    if (disabled) return;
    const step = event.shiftKey ? 0.1 : 0.02;
    if (event.key === 'ArrowRight') {
      event.preventDefault();
      onSeek(Math.min(shown + step, 1));
    } else if (event.key === 'ArrowLeft') {
      event.preventDefault();
      onSeek(Math.max(shown - step, 0));
    }
  }
</script>

<div
  bind:this={track}
  class="seek seek--{size}"
  class:dragging
  class:disabled
  role="slider"
  tabindex={disabled ? -1 : 0}
  aria-label={label}
  aria-valuemin={0}
  aria-valuemax={100}
  aria-valuenow={Math.round(shown * 100)}
  onpointerdown={onPointerDown}
  onpointermove={onPointerMove}
  onpointerup={onPointerUp}
  onpointercancel={onPointerUp}
  onkeydown={onKeyDown}
>
  <div class="seek__track">
    <div class="seek__fill" style:width="{shown * 100}%"></div>
    {#if marks.length > 0 && marks.length <= 400}
      {#each marks as mark (mark)}
        <span class="seek__mark" style:left="{mark * 100}%"></span>
      {/each}
    {/if}
    <div class="seek__thumb" style:left="{shown * 100}%"></div>
  </div>
</div>

<style>
  .seek {
    display: flex;
    align-items: center;
    width: 100%;
    padding-block: 6px;
    cursor: pointer;
    touch-action: none;
  }

  .seek.disabled {
    cursor: default;
    opacity: 0.5;
  }

  .seek__track {
    position: relative;
    width: 100%;
    height: 3px;
    border-radius: var(--radius-pill);
    background: var(--surface-inset);
    transition: height var(--dur-1) var(--ease);
  }

  .seek--lg .seek__track {
    height: 6px;
  }

  .seek--lg:hover .seek__track,
  .seek--lg.dragging .seek__track {
    height: 8px;
  }

  .seek__fill {
    position: absolute;
    inset-block: 0;
    left: 0;
    border-radius: inherit;
    background: var(--accent);
  }

  /* Chapter boundaries: a hairline in the canvas colour, so it reads as a gap
     in the accent fill rather than as another coloured element. */
  .seek__mark {
    position: absolute;
    top: 0;
    bottom: 0;
    width: 1px;
    margin-left: -0.5px;
    background: var(--canvas);
    opacity: 0.9;
    pointer-events: none;
  }

  .seek__thumb {
    position: absolute;
    top: 50%;
    width: 11px;
    height: 11px;
    margin-left: -5.5px;
    border-radius: 50%;
    background: var(--accent);
    transform: translateY(-50%) scale(0);
    transition: transform var(--dur-1) var(--ease);
  }

  .seek--lg .seek__thumb {
    width: 14px;
    height: 14px;
    margin-left: -7px;
  }

  .seek:hover .seek__thumb,
  .seek:focus-visible .seek__thumb,
  .seek.dragging .seek__thumb {
    transform: translateY(-50%) scale(1);
  }

  .seek:focus-visible {
    outline: none;
  }

  .seek:focus-visible .seek__track {
    box-shadow: 0 0 0 2px var(--accent-line);
  }
</style>
