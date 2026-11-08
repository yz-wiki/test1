<script lang="ts">
  /**
   * One hover surface for the whole app.
   *
   * Native `title` tooltips are drawn by Windows: square, delayed ~1 s, and
   * impossible to theme. In the continue-listening panel they also overlapped
   * our own cover chip, which is exactly the double bubble in the screenshot.
   * This uses the same overlay tokens as Dropdown / ContextMenu, opens with a
   * short intent delay, and is `position: fixed` because the home panel is its
   * own scroll container — an absolutely positioned popover would be clipped.
   *
   * Trade-off: it is anchored to the row, not to the pointer. Pointer-following
   * cards jitter over a list and cover the row you are trying to click; a
   * stable card beside the row stays readable and never eats the click.
   */
  import type { Snippet } from 'svelte';

  let {
    children,
    pop,
    width = 292,
  }: { children: Snippet<[boolean]>; pop: Snippet; width?: number } = $props();

  let host = $state<HTMLElement | null>(null);
  let popEl = $state<HTMLElement | null>(null);
  let open = $state(false);
  let x = $state(0);
  let y = $state(0);
  let popWidth = $state(0);
  let anchorTop = $state(0);
  let timer: ReturnType<typeof setTimeout> | null = null;

  function place(): void {
    if (!host) return;
    const rect = host.getBoundingClientRect();
    const gap = 10;
    // A caller can mark the panel that owns the row. The card then stays
    // inside that panel instead of drifting over the adjacent book grid —
    // where its text used to sit on top of the covers.
    const boundary = host.closest('[data-hover-boundary]');
    const limit = boundary
      ? Math.min(window.innerWidth - 8, boundary.getBoundingClientRect().right - 8)
      : window.innerWidth - 8;
    popWidth = Math.min(width, Math.max(180, limit - 16));

    const toRight = rect.right + gap + popWidth <= limit;
    const preferred = toRight ? rect.right + gap : rect.left - popWidth - gap;
    x = Math.max(8, Math.min(preferred, limit - popWidth));
    anchorTop = rect.top;
    y = Math.max(8, rect.top - 12);
  }

  /** The card used to assume a fixed 240px height, which clipped longer
      descriptions. Measure the real box once it exists and clamp against the
      viewport instead. */
  $effect(() => {
    if (!open || !popEl) return;
    const height = popEl.offsetHeight;
    const maxY = Math.max(8, window.innerHeight - height - 8);
    y = Math.min(Math.max(8, anchorTop - 12), maxY);
  });

  function enter(): void {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      place();
      open = true;
    }, 140);
  }

  function leave(): void {
    if (timer) clearTimeout(timer);
    open = false;
  }
</script>

<div
  class="hovercard"
  role="group"
  bind:this={host}
  onpointerenter={enter}
  onpointerleave={leave}
  onfocusin={enter}
  onfocusout={leave}
>
  {@render children(open)}
</div>

{#if open}
  <div
    class="hovercard__pop"
    bind:this={popEl}
    style:left="{x}px"
    style:top="{y}px"
    style:width="{popWidth || width}px"
    role="tooltip"
  >
    {@render pop()}
  </div>
{/if}

<style>
  /* Must generate a box: `display: contents` gives a zero rect, which makes
     the placement maths anchor the card at the window's top-left corner. */
  .hovercard {
    display: block;
    min-width: 0;
  }

  .hovercard__pop {
    position: fixed;
    z-index: 95;
    padding: var(--gap-row);
    border-radius: var(--radius-md);
    border: 1px solid var(--hairline-strong);
    background: var(--surface-overlay);
    box-shadow: var(--shadow-3);
    color: var(--text);
    pointer-events: none;
    /* Adapt to content height, but never grow past the window. */
    max-height: min(72vh, 520px);
    overflow: hidden;
    animation: hover-in var(--dur-2) var(--ease);
  }

  @keyframes hover-in {
    from { opacity: 0; transform: translateY(3px); }
    to { opacity: 1; transform: none; }
  }

  @media (prefers-reduced-motion: reduce) {
    .hovercard__pop { animation: none; }
  }
</style>
