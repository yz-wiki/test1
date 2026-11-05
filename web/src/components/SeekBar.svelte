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
    {#if dragging}
      <div class="seek__bubble t-num" style:left="{shown * 100}%">{Math.round(shown * 100)}%</div>
    {/if}
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
    height: 4px;
    border-radius: var(--radius-pill);
    background: var(--hairline);
    transition: height var(--dur-1) var(--ease);
  }

  .seek--lg .seek__track {
    height: 8px;
    box-shadow: inset 0 0 0 1px var(--hairline);
  }

  .seek--lg:hover .seek__track,
  .seek--lg.dragging .seek__track {
    height: 10px;
  }

  .seek__fill {
    position: absolute;
    inset-block: 0;
    left: 0;
    border-radius: inherit;
    background: var(--accent);
    /* The played segment glows, so the eye lands on the boundary even when
       the surrounding UI is busy. */
    box-shadow: 0 0 10px 1px var(--accent-line);
  }

  .seek--lg .seek__fill {
    background: linear-gradient(90deg, var(--accent-hover), var(--accent));
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

  /* The playhead is ALWAYS visible. It used to be scale(0) on the small bar,
     which is why "where am I" needed a second glance. White ring + accent
     core + halo keeps it legible on every theme and against the played fill. */
  .seek__thumb {
    position: absolute;
    top: 50%;
    width: 14px;
    height: 14px;
    margin-left: -7px;
    border-radius: 50%;
    background: var(--accent);
    border: 2px solid var(--surface-overlay);
    box-shadow: 0 0 0 4px var(--accent-soft), 0 1px 5px rgb(0 0 0 / 0.24);
    transform: translateY(-50%) scale(1);
    transition: transform var(--dur-1) var(--ease), box-shadow var(--dur-1) var(--ease);
    pointer-events: none;
  }

  .seek--lg .seek__thumb {
    width: 18px;
    height: 18px;
    margin-left: -9px;
    border-width: 3px;
  }

  .seek:hover .seek__thumb,
  .seek:focus-visible .seek__thumb {
    transform: translateY(-50%) scale(1.12);
  }

  .seek.dragging .seek__thumb {
    transform: translateY(-50%) scale(1.28);
    box-shadow: 0 0 0 7px var(--accent-soft), 0 2px 8px rgb(0 0 0 / 0.3);
  }

  /* A percentage follows the drag so fine seeking does not require reading
     the small time labels at the ends of the track. */
  .seek__bubble {
    position: absolute;
    bottom: calc(100% + 10px);
    transform: translateX(-50%);
    padding: 2px 7px;
    border-radius: var(--radius-pill);
    background: var(--accent);
    color: var(--on-accent);
    font-size: var(--text-2xs);
    font-weight: var(--weight-semibold);
    white-space: nowrap;
    pointer-events: none;
    box-shadow: var(--shadow-2);
  }

  .seek:focus-visible {
    outline: none;
  }

  .seek:focus-visible .seek__track {
    box-shadow: 0 0 0 2px var(--accent-line);
  }
</style>
