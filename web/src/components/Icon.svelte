<script lang="ts">
  /**
   * A small, hand-drawn icon set on a 16px grid, 1.5px stroke.
   * Keeping the set closed (a union type) is what stops 40 slightly different
   * arrow glyphs appearing across screens.
   */
  export type IconName =
    | 'library'
    | 'settings'
    | 'play'
    | 'pause'
    | 'search'
    | 'chevron-left'
    | 'chevron-right'
    | 'headphones'
    | 'refresh'
    | 'check'
    | 'plus'
    | 'close'
    | 'book'
    | 'clock'
    | 'skip-back'
    | 'skip-forward'
    | 'volume'
    | 'chevron-down'
    | 'expand'
    | 'download'
    | 'server'
    | 'dots';

  let { name, size = 16, filled = false }: {
    name: IconName;
    size?: number;
    filled?: boolean;
  } = $props();
</script>

<svg
  width={size}
  height={size}
  viewBox="0 0 16 16"
  fill="none"
  stroke={filled ? 'none' : 'currentColor'}
  stroke-width="1.5"
  stroke-linecap="round"
  stroke-linejoin="round"
  aria-hidden="true"
>
  {#if name === 'library'}
    <path d="M2.5 3.2h3.2v9.6H2.5zM6.8 3.2h3.2v9.6H6.8z" />
    <path d="M11.6 4.1l2.2 8.4" />
  {:else if name === 'settings'}
    <circle cx="8" cy="8" r="2.1" />
    <path d="M8 1.9v1.4M8 12.7v1.4M2.7 8h1.4M11.9 8h1.4M4.2 4.2l1 1M10.8 10.8l1 1M11.8 4.2l-1 1M5.2 10.8l-1 1" />
  {:else if name === 'play'}
    <path d="M4.6 3.1l8 4.9-8 4.9z" fill="currentColor" stroke="none" />
  {:else if name === 'pause'}
    <rect x="4.4" y="3.2" width="2.7" height="9.6" rx="1" fill="currentColor" stroke="none" />
    <rect x="8.9" y="3.2" width="2.7" height="9.6" rx="1" fill="currentColor" stroke="none" />
  {:else if name === 'search'}
    <circle cx="7.2" cy="7.2" r="4.2" />
    <path d="M10.3 10.3l2.9 2.9" />
  {:else if name === 'chevron-left'}
    <path d="M9.8 3.6L5.4 8l4.4 4.4" />
  {:else if name === 'chevron-right'}
    <path d="M6.2 3.6L10.6 8l-4.4 4.4" />
  {:else if name === 'headphones'}
    <path d="M2.8 9.2V8a5.2 5.2 0 0110.4 0v1.2" />
    <rect x="2" y="9" width="2.8" height="4.2" rx="1.4" />
    <rect x="11.2" y="9" width="2.8" height="4.2" rx="1.4" />
  {:else if name === 'refresh'}
    <path d="M13.2 8a5.2 5.2 0 11-1.6-3.7" />
    <path d="M13.3 2.6v2.9h-2.9" />
  {:else if name === 'check'}
    <path d="M3.2 8.4l3 3 6.6-6.8" />
  {:else if name === 'plus'}
    <path d="M8 3.4v9.2M3.4 8h9.2" />
  {:else if name === 'close'}
    <path d="M4.2 4.2l7.6 7.6M11.8 4.2l-7.6 7.6" />
  {:else if name === 'book'}
    <path d="M3 2.8h4.2a1.6 1.6 0 011.6 1.6v9a1.4 1.4 0 00-1.4-1.4H3z" />
    <path d="M13 2.8H8.8A1.6 1.6 0 007.2 4.4v9a1.4 1.4 0 011.4-1.4H13z" />
  {:else if name === 'clock'}
    <circle cx="8" cy="8" r="5.4" />
    <path d="M8 4.9V8l2.2 1.4" />
  {:else if name === 'skip-back'}
    <path d="M3.4 3.4v9.2" />
    <path d="M12.6 3.6L5.4 8l7.2 4.4z" fill="currentColor" stroke="none" />
  {:else if name === 'skip-forward'}
    <path d="M12.6 3.4v9.2" />
    <path d="M3.4 3.6L10.6 8l-7.2 4.4z" fill="currentColor" stroke="none" />
  {:else if name === 'volume'}
    <path d="M3 6.2h2.2L9 3.4v9.2L5.2 9.8H3z" />
    <path d="M11.4 6.1a2.9 2.9 0 010 3.8" />
  {:else if name === 'chevron-down'}
    <path d="M3.6 6.2L8 10.6l4.4-4.4" />
  {:else if name === 'expand'}
    <path d="M6.2 2.9h6.9v6.9" />
    <path d="M9.8 6.2L2.9 13.1" />
  {:else if name === 'download'}
    <path d="M8 2.6v7.2" />
    <path d="M5 7l3 3 3-3" />
    <path d="M3.2 12.4h9.6" />
  {:else if name === 'server'}
    <rect x="2.4" y="3" width="11.2" height="4" rx="1.2" />
    <rect x="2.4" y="9" width="11.2" height="4" rx="1.2" />
    <path d="M4.8 5h.01M4.8 11h.01" />
  {:else if name === 'dots'}
    <circle cx="4" cy="8" r="1.1" fill="currentColor" stroke="none" />
    <circle cx="8" cy="8" r="1.1" fill="currentColor" stroke="none" />
    <circle cx="12" cy="8" r="1.1" fill="currentColor" stroke="none" />
  {/if}
</svg>
