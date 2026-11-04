<script lang="ts">
  import { onMount } from 'svelte';
  import { progress, session, ui } from './lib/state.svelte';
  import { player } from './lib/player.svelte';
  import { downloads } from './lib/downloads.svelte';
  import { sync } from './lib/sync.svelte';
  import { installShortcuts } from './lib/shortcuts';
  import Login from './routes/Login.svelte';
  import Library from './routes/Library.svelte';
  import Book from './routes/Book.svelte';
  import Podcast from './routes/Podcast.svelte';
  import Downloads from './routes/Downloads.svelte';
  import Admin from './routes/Admin.svelte';
  import Settings from './routes/Settings.svelte';
  import Player from './routes/Player.svelte';
  import Shell from './components/Shell.svelte';

  let booting = $state(true);
  let uninstallShortcuts: (() => void) | null = null;

  onMount(async () => {
    uninstallShortcuts = installShortcuts();
    // The transport is driven by the Rust session's ticks; subscribe once for
    // the lifetime of the window rather than per screen.
    void player.attach();
    void downloads.attach();
    void sync.attach();
    try {
      await session.bootstrap();
    } finally {
      booting = false;
    }
  });

  $effect(() => () => {
    uninstallShortcuts?.();
    uninstallShortcuts = null;
  });

  // Listening progress belongs to the server, not to a screen: load it once the
  // session is up, and again whenever the server changes.
  $effect(() => {
    if (session.authenticated && session.serverUrl) {
      void progress.load(session.serverUrl);
      void downloads.load();
      void sync.ensureConnected(session.serverUrl);
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
    {:else if ui.route === 'book'}
      <Book />
    {:else if ui.route === 'podcast'}
      <Podcast />
    {:else if ui.route === 'downloads'}
      <Downloads />
    {:else if ui.route === 'admin'}
      <Admin />
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
