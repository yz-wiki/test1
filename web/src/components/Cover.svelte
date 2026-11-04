<script lang="ts">
  import { convertFileSrc } from '@tauri-apps/api/core';
  import { invoke } from '@tauri-apps/api/core';
  import { session } from '../lib/state.svelte';

  let { itemId, size = 320, radius }: {
    itemId: string;
    size?: number;
    radius?: string;
  } = $props();

  let src = $state<string | null>(null);
  let failed = $state(false);

  /**
   * Covers come from Rust, which caches them on disk and returns a path; the
   * asset protocol is what makes that path renderable in the webview. Requesting
   * them per tile (rather than one batch) keeps the grid lazy.
   */
  $effect(() => {
    const serverUrl = session.serverUrl;
    if (!serverUrl || !itemId) return;
    let cancelled = false;
    failed = false;

    invoke<string>('get_cover', { serverUrl, itemId, width: size, bust: null })
      .then(path => {
        if (!cancelled) src = convertFileSrc(path);
      })
      .catch(() => {
        if (!cancelled) failed = true;
      });

    return () => {
      cancelled = true;
    };
  });
</script>

<div class="cover" style:border-radius={radius}>
  {#if src && !failed}
    <img {src} alt="" loading="lazy" onerror={() => (failed = true)} />
  {:else}
    <div class="cover__fallback">
      <span>{itemId.slice(0, 1).toUpperCase()}</span>
    </div>
  {/if}
</div>

<style>
  .cover__fallback {
    display: grid;
    place-items: center;
    width: 100%;
    height: 100%;
    background: linear-gradient(160deg, var(--surface-raised), var(--surface-inset));
    color: var(--text-tertiary);
    font-size: var(--text-xl);
    font-weight: var(--weight-semibold);
  }
</style>
