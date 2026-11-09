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
    // `root.style.zoom` scales every CSS pixel in this document. Bounding
    // rects come back in scaled visual pixels, while `left`/`top`/`width` on
    // the fixed card are authored in unscaled CSS pixels. Convert once here:
    // otherwise a 110% UI scale offsets the card by ~10% of the viewport.
    const zoom = Number.parseFloat(getComputedStyle(document.documentElement).zoom) || 1;
    const box = host.getBoundingClientRect();
    const rect = {
      left: box.left / zoom,
      right: box.right / zoom,
      top: box.top / zoom,
      bottom: box.bottom / zoom,
    };
    const gap = 10;
    const edge = 8;
    const vw = window.innerWidth;

    // The card must never sit ON TOP of the row that opened it. The old code
    // clamped it inside a `[data-hover-boundary]` panel: the listening rail is
    // only ~300px wide, so a 292px card could not fit beside the row, `toRight`
    // went false, and the fallback `rect.left - width - gap` collapsed to x=8
    // — the card landed over the whole list. The viewport is the only sane
    // limit; prefer the space just past the row's right edge.
    const full = Math.min(width, Math.max(200, vw - edge * 2));
    const right = rect.right + gap;
    const left = rect.left - gap - full;
    if (right + full <= vw - edge) {
      popWidth = full;
      x = right;
    } else if (left >= edge) {
      popWidth = full;
      x = left;
    } else {
      // Narrow window: shrink into whatever right-hand gap remains, never
      // crossing back over the anchor row.
      const available = Math.max(200, vw - edge - right);
      popWidth = Math.min(full, available);
      x = Math.max(edge, Math.min(right, vw - edge - popWidth));
    }
    anchorTop = rect.top;
    y = Math.max(edge, rect.top - 12);
  }

  /** The dashboard now has two independent scroll panes. A `position: fixed`
      card is anchored in viewport coordinates, so it has to follow its row
      when either pane scrolls (capture phase) or the window is resized. */
  $effect(() => {
    if (!open) return;
    const reposition = () => place();
    window.addEventListener('scroll', reposition, true);
    window.addEventListener('resize', reposition);
    return () => {
      window.removeEventListener('scroll', reposition, true);
      window.removeEventListener('resize', reposition);
    };
  });

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
    /* Adapt to content height, but never grow past the window. `vh` is itself
       scaled by root zoom, so divide it out to keep the cap honest. */
    max-height: min(calc(72vh / var(--ui-scale, 1)), 520px);
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
