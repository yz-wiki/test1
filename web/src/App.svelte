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
  import DownloadDialog from './components/DownloadDialog.svelte';

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
      // Bootstrap itself is offline-first, but a wedged IPC (keyring, plugin,
      // WebView startup) must not be able to trap the window on the splash
      // either. Hard cap: show a real screen after 4 s and let the restore
      // finish in the background — Svelte will fill the shell in when it does.
      const BOOT_CAP_MS = 4000;
      await Promise.race([
        session.bootstrap(),
        new Promise<void>(resolve => setTimeout(resolve, BOOT_CAP_MS)),
      ]);
      logs.app(
        'info',
        'auth',
        session.authenticated
          ? `session restored for ${session.user?.username ?? 'unknown'} on ${session.serverUrl}`
          : 'no stored session',
      );
    } catch (error) {
      // A thrown bootstrap used to escape onMount as an unhandled rejection
      // and leave `booting` true forever.
      logs.app('error', 'boot', `session restore failed: ${String(error)}`);
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

{#if session.authenticated && session.error}
  <div class="offline" role="status">
    <span class="offline__dot" aria-hidden="true"></span>
    <div class="offline__text">
      <strong>{t('app.offline')}</strong>
      <span class="offline__detail truncate">{session.error}</span>
    </div>
    <button class="offline__action" onclick={() => void session.loadLibraries()}>
      {t('library.retry')}
    </button>
    <button
      class="offline__action offline__action--close"
      aria-label={t('app.dismiss')}
      onclick={() => (session.error = null)}
    >×</button>
  </div>
{/if}

<ContextMenu />
<DownloadDialog />

<style>
  .boot {
    display: grid;
    place-items: center;
    height: calc(100vh / var(--ui-scale, 1));
    background: var(--canvas);
  }

  /* The server may be down while the shell is perfectly usable. Say so
     without blocking the shelf, and let one click re-run the reconciliation. */
  .offline {
    position: fixed;
    right: 18px;
    bottom: 104px;
    z-index: 60;
    display: flex;
    align-items: center;
    gap: 10px;
    width: min(360px, calc(100vw - 36px));
    padding: 10px 12px;
    border: 1px solid var(--hairline);
    border-radius: var(--radius-md);
    background: var(--surface);
    box-shadow: 0 8px 28px rgb(0 0 0 / 14%);
    font-size: 12px;
    color: var(--text);
  }

  .offline__dot {
    width: 8px;
    height: 8px;
    flex: 0 0 auto;
    border-radius: 50%;
    background: #d9822b;
  }

  .offline__text {
    display: flex;
    flex: 1 1 auto;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }

  .offline__detail {
    color: var(--text-tertiary);
    font-size: 11px;
  }

  .offline__action {
    flex: 0 0 auto;
    padding: 4px 8px;
    border: 1px solid var(--hairline);
    border-radius: var(--radius-sm);
    background: transparent;
    color: var(--text);
    cursor: pointer;
    font: inherit;
  }

  .offline__action:hover {
    background: var(--accent-soft);
  }

  .offline__action--close {
    padding-inline: 7px;
    font-size: 15px;
    line-height: 1;
  }
</style>
