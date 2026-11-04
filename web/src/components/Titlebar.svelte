<script lang="ts">
  import { getCurrentWindow } from '@tauri-apps/api/window';
  import { session, ui } from '../lib/state.svelte';
  import { player } from '../lib/player.svelte';

  let { title = 'Skald', subtitle = '' }: { title?: string; subtitle?: string } = $props();

  const win = getCurrentWindow();

  // The window is undecorated, so the whole bar is the drag handle; the control
  // buttons opt out via data-no-drag.
  function drag(event: MouseEvent) {
    if ((event.target as HTMLElement).closest('[data-no-drag]')) return;
    if (event.button !== 0) return;
    void win.startDragging();
  }
</script>

<header
  class="titlebar"
  role="presentation"
  onmousedown={drag}
  ondblclick={() => void win.toggleMaximize()}
>
  <div class="titlebar__brand">
    <span class="titlebar__mark">S</span>
    <div class="titlebar__text">
      <span class="titlebar__title">{title}</span>
      {#if subtitle}
        <span class="titlebar__sub truncate">{subtitle}</span>
      {/if}
    </div>
  </div>

  <div class="titlebar__spacer"></div>

  <!-- The account lives here rather than at the bottom of the rail: it is
       window-level, not library-level, and it stays put when the rail folds. -->
  <button
    class="titlebar__account"
    data-no-drag
    title={session.user?.username ?? ''}
    onclick={() => {
      player.collapse();
      ui.settingsSection = 'account';
      ui.route = 'settings';
    }}
  >
    <span class="titlebar__avatar">{(session.user?.username ?? '?').slice(0, 1).toUpperCase()}</span>
    {#if session.user?.username}
      <span class="titlebar__username truncate">{session.user.username}</span>
    {/if}
  </button>

  <div class="titlebar__controls" data-no-drag>
    <button
      class="winbtn"
      aria-label="Minimize"
      onclick={() => void (ui.closeToTray ? win.hide() : win.minimize())}
    >
      <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
        <path d="M2 5h6" stroke="currentColor" stroke-width="1.1" stroke-linecap="round" />
      </svg>
    </button>
    <button class="winbtn" aria-label="Maximize" onclick={() => void win.toggleMaximize()}>
      <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
        <rect x="2.2" y="2.2" width="5.6" height="5.6" rx="1" stroke="currentColor" stroke-width="1.1" fill="none" />
      </svg>
    </button>
    <button
      class="winbtn winbtn--close"
      aria-label="Close"
      title={ui.closeToTray ? 'Skald' : undefined}
      onclick={() => void (ui.closeToTray ? win.hide() : win.close())}
    >
      <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
        <path d="M2.6 2.6l4.8 4.8M7.4 2.6L2.6 7.4" stroke="currentColor" stroke-width="1.1" stroke-linecap="round" />
      </svg>
    </button>
  </div>
</header>

<style>
  .titlebar__account {
    display: flex;
    align-items: center;
    gap: var(--gap-inline);
    max-width: 180px;
    padding: 3px 8px 3px 3px;
    border-radius: var(--radius-pill);
    color: var(--text-secondary);
  }

  .titlebar__account:hover {
    background: var(--surface-raised);
    color: var(--text);
  }

  .titlebar__avatar {
    display: grid;
    place-items: center;
    width: 20px;
    height: 20px;
    flex: 0 0 20px;
    border-radius: 50%;
    background: var(--accent);
    color: var(--on-accent);
    font-size: var(--text-2xs);
    font-weight: var(--weight-bold);
  }

  .titlebar__username {
    font-size: var(--text-xs);
  }

  .titlebar {
    display: flex;
    align-items: center;
    gap: var(--gap-row);
    height: 46px;
    flex: 0 0 46px;
    padding: 0 var(--gap-block) 0 var(--gap-panel);
    border-bottom: 1px solid var(--hairline);
    background: var(--canvas);
    -webkit-app-region: drag;
  }

  .titlebar__brand {
    display: flex;
    align-items: center;
    gap: var(--gap-inline);
    min-width: 0;
  }

  .titlebar__mark {
    display: grid;
    place-items: center;
    width: 22px;
    height: 22px;
    border-radius: var(--radius-xs);
    background: var(--accent-soft);
    color: var(--accent);
    font-size: var(--text-xs);
    font-weight: var(--weight-bold);
  }

  .titlebar__text {
    display: flex;
    align-items: baseline;
    gap: var(--gap-inline);
    min-width: 0;
  }

  .titlebar__title {
    font-size: var(--text-sm);
    font-weight: var(--weight-semibold);
  }

  .titlebar__sub {
    font-size: var(--text-xs);
    color: var(--text-tertiary);
    max-width: 46ch;
  }

  .titlebar__spacer {
    flex: 1 1 auto;
  }

  .titlebar__controls {
    display: flex;
    align-items: center;
    height: 100%;
    margin-right: calc(var(--gap-block) * -1);
    -webkit-app-region: no-drag;
  }

  .winbtn {
    display: grid;
    place-items: center;
    width: 44px;
    height: 100%;
    color: var(--text-tertiary);
    transition: background var(--dur-1) var(--ease), color var(--dur-1) var(--ease);
  }

  .winbtn:hover {
    background: var(--surface-raised);
    color: var(--text);
  }

  .winbtn--close:hover {
    background: var(--danger);
    color: #fff;
  }
</style>
