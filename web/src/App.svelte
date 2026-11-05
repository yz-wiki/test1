<script lang="ts">
  import { onMount } from 'svelte';
  import { listen } from '@tauri-apps/api/event';
  import { progress, session, ui } from './lib/state.svelte';
  import { player } from './lib/player.svelte';
  import { downloads } from './lib/downloads.svelte';
  import { sync } from './lib/sync.svelte';
  import { installShortcuts } from './lib/shortcuts';
  import { AUTH_LOST } from './lib/ipc';
  import { logs } from './lib/logs.svelte';
  import { t } from './lib/i18n.svelte';
  import BrandMark from './components/BrandMark.svelte';
  import Login from './routes/Login.svelte';
  import Library from './routes/Library.svelte';
  import Continue from './routes/Continue.svelte';
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
  let uninstallLogs: (() => void) | null = null;

  onMount(async () => {
    uninstallShortcuts = installShortcuts();
    logs.app('info', 'boot', 'window created');

    // The app stream: uncaught errors, rejected promises, session and sync
    // transitions. The server stream is filled by every call() in ipc.ts.
    const onError = (event: ErrorEvent) =>
      logs.app('error', 'window', event.message || 'unknown error');
    const onReject = (event: PromiseRejectionEvent) =>
      logs.app('error', 'promise', String(event.reason));
    window.addEventListener('error', onError);
    window.addEventListener('unhandledrejection', onReject);
    uninstallLogs = () => {
      window.removeEventListener('error', onError);
      window.removeEventListener('unhandledrejection', onReject);
    };

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
    const onAuthLost = () => {
      logs.app('warn', 'auth', 'session expired — returning to sign-in');
      session.expire();
    };
    window.addEventListener(AUTH_LOST, onAuthLost);
    void listen('auth-expired', () => session.expire());
    uninstallAuth = () => window.removeEventListener(AUTH_LOST, onAuthLost);
    try {
      await session.bootstrap();
      logs.app(
        'info',
        'auth',
        session.authenticated
          ? `signed in as ${session.user?.username ?? 'unknown'} on ${session.serverUrl}`
          : 'no stored session',
      );
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
    uninstallLogs?.();
    uninstallLogs = null;
  });

  let lastSocket = '';
  $effect(() => {
    const state = sync.socket;
    if (state !== lastSocket) {
      lastSocket = state;
      logs.app('info', 'sync', `socket ${state}`);
    }
  });

  let lastRoute = '';
  $effect(() => {
    const route = ui.route;
    if (route !== lastRoute) {
      lastRoute = route;
      logs.app('debug', 'ui', `route → ${route}`);
    }
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
    <BrandMark size={30} label={t('app.name')} />
    <span class="t-label">{t('app.name')}</span>
  </div>
{:else if !session.authenticated}
  <Login />
{:else}
  <Shell>
    {#if player.expanded}
      <Player />
    {:else if ui.route === 'continue'}
      <Continue />
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
