<script lang="ts">
  /**
   * The read-only companion to SeekBar.
   *
   * A book has two scales — this chapter and the whole book — and putting both
   * on draggable bars made the transport look like two sliders fighting. Only
   * the chapter is seekable; the whole-book figure is a 2px line that shows
   * position without pretending to be a control.
   */
  let {
    value,
    label,
    marks = [],
  }: {
    value: number;
    label?: string;
    /** Bookmark positions as 0–1 fractions, drawn as diamonds. */
    marks?: number[];
  } = $props();

  const shown = $derived(Math.min(Math.max(value, 0), 1));
</script>

<div class="line" role="img" aria-label={label} title={label}>
  <div class="line__track">
    <div class="line__fill" style:width="{shown * 100}%"></div>
    {#each marks as mark (mark)}
      <span class="line__mark" style:left="{mark * 100}%"></span>
    {/each}
  </div>
</div>

<style>
  .line {
    display: flex;
    align-items: center;
    width: 100%;
    height: 8px;
  }

  .line__track {
    position: relative;
    width: 100%;
    height: 2px;
    border-radius: var(--radius-pill);
    background: var(--surface-inset);
    overflow: visible;
  }

  .line__fill {
    position: absolute;
    inset-block: 0;
    left: 0;
    border-radius: inherit;
    background: color-mix(in oklab, var(--accent) 55%, transparent);
  }

  .line__mark {
    position: absolute;
    top: 50%;
    width: 5px;
    height: 5px;
    margin-left: -2.5px;
    border-radius: 1px;
    background: var(--accent);
    transform: translateY(-50%) rotate(45deg);
  }
</style>
