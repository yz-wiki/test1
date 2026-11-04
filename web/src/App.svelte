<script lang="ts">
  import { onMount } from 'svelte';
  import { session, ui } from './lib/state.svelte';
  import { player } from './lib/player.svelte';
  import Login from './routes/Login.svelte';
  import Library from './routes/Library.svelte';
  import Settings from './routes/Settings.svelte';
  import Player from './routes/Player.svelte';
  import Shell from './components/Shell.svelte';

  let booting = $state(true);

  onMount(async () => {
    // The transport is driven by the Rust session's ticks; subscribe once for
    // the lifetime of the window rather than per screen.
    void player.attach();
    try {
      await session.bootstrap();
    } finally {
      booting = false;
    }
  });
</script>

{#if booting}
  <div class="boot">
    <span class="t-label">Skald</span>
  </div>
{:else if !session.authenticated}
  <Login />
{:else}
  <Shell>
    {#if player.expanded}
      <Player />
    {:else if ui.route === 'settings'}
      <Settings />
    {:else}
      <Library />
    {/if}
  </Shell>
{/if}

<style>
  .boot {
    display: grid;
    place-items: center;
    height: 100vh;
    background: var(--canvas);
  }
</style>
