<script lang="ts">
  /**
   * The app mark: an open page whose right edge becomes a three-bar waveform.
   *
   * Drawn with currentColor / theme tokens rather than a fixed purple square,
   * so it follows the accent in every theme (including a user's custom one)
   * and stays legible on both light and dark canvases.
   */
  import { BRAND } from '../lib/brand';

  let {
    size = 22,
    label = '',
  }: { size?: number; label?: string } = $props();

  const uid = $state(`brand-${Math.random().toString(36).slice(2, 9)}`);
</script>

<svg
  class="brand-mark"
  width={size}
  height={size}
  viewBox="0 0 32 32"
  role={label ? 'img' : 'presentation'}
  aria-label={label || undefined}
  aria-hidden={label ? undefined : 'true'}
>
  <defs>
    <linearGradient id={uid} x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="var(--accent)" />
      <stop offset="1" stop-color="var(--accent-hover)" />
    </linearGradient>
  </defs>
  <rect x="0" y="0" width="32" height="32" rx="9" fill="url(#{uid})" />
  <!-- Two page halves with a shared spine at x=16. -->
  <path
    d="M5.5 10.5c3.2-1.6 6.6-1.6 10.5 0.6v13c-3.9-2.2-7.3-2.2-10.5-0.6z"
    fill="var(--on-accent)"
    opacity="0.92"
  />
  <path
    d="M16 11.1c3.9-2.2 7.3-2.2 10.5-0.6v12.4c-3.2-1.6-6.6-1.6-10.5 0.6z"
    fill="var(--on-accent)"
    opacity="0.55"
  />
  <!-- The fold turns into sound: three rising bars. -->
  <path
    d="M19.5 19.2v2.6M23 16.8v5M26.5 14v7.8"
    stroke="var(--on-accent)"
    stroke-width="1.7"
    stroke-linecap="round"
  />
  <title>{BRAND.mark}</title>
</svg>

<style>
  .brand-mark {
    display: block;
    flex: 0 0 auto;
    border-radius: var(--radius-xs);
  }
</style>
