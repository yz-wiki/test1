<script lang="ts">
  import { onMount } from 'svelte';
  import { listen } from '@tauri-apps/api/event';
  import { progress, session, ui } from './lib/state.svelte';
  import { player } from './lib/player.svelte';
  import { downloads } from './lib/downloads.svelte';
  import { sync } from './lib/sync.svelte';
  import { installShortcuts } from './lib/shortcuts';
  import { AUTH_LOST } from './lib/ipc';
  import Login from './routes/Login.svelte';
  import Library from './routes/Library.svelte';
  import Book from './routes/Book.svelte';
  import Podcast from './routes/Podcast.svelte';
  import Downloads from './routes/Downloads.svelte';
  import Admin from './routes/Admin.svelte';
  import Settings from './routes/Settings.svelte';
  import Player from './routes/Player.svelte';
  import Shell from './components/Shell.svelte';
  import ContextMenu from './components/ContextMenu.svelte';

  let booting = $state(true);
  let uninstallShortcuts: (() => void) | null = null;
  let uninstallMenu: (() => void) | null = null;
  let uninstallAuth: (() => void) | null = null;

  onMount(async () => {
    uninstallShortcuts = installShortcuts();

    // The webview's default menu (Back / Reload / Save as / Print) belongs to a
    // browser. Text fields keep theirs so copy and paste still work.
    const suppressDefaultMenu = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest('input, textarea, [contenteditable="true"]')) return;
      if (target?.closest('[data-native-menu]')) return;
      event.preventDefault();
    };
    window.addEventListener('contextmenu', suppressDefaultMenu);
    uninstallMenu = () => window.removeEventListener('contextmenu', suppressDefaultMenu);
    // The transport is driven by the Rust session's ticks; subscribe once for
    // the lifetime of the window rather than per screen.
    void player.attach();
    void downloads.attach();
    void sync.attach();

    // A dead credential used to leave every screen blank with a red line of
    // Rust text. Go back to sign-in instead, and say why.
    const onAuthLost = () => session.expire();
    window.addEventListener(AUTH_LOST, onAuthLost);
    void listen('auth-expired', () => session.expire());
    uninstallAuth = () => window.removeEventListener(AUTH_LOST, onAuthLost);
    try {
      await session.bootstrap();
    } finally {
      booting = false;
    }
  });

  $effect(() => () => {
    uninstallShortcuts?.();
    uninstallShortcuts = null;
    uninstallMenu?.();
    uninstallMenu = null;
    uninstallAuth?.();
    uninstallAuth = null;
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

<ContextMenu />

<style>
  .boot {
    display: grid;
    place-items: center;
    height: calc(100vh / var(--ui-scale, 1));
    background: var(--canvas);
  }
</style>
