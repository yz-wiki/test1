<script lang="ts">
  import { getCurrentWindow } from '@tauri-apps/api/window';
  import { session, ui } from '../lib/state.svelte';
  import { player } from '../lib/player.svelte';
  import { preloadPinyin } from '../lib/search';
  import { BRAND } from '../lib/brand';
  import { t } from '../lib/i18n.svelte';
  import BrandMark from './BrandMark.svelte';
  import Icon from './Icon.svelte';

  let { title = BRAND.name, subtitle = '' }: { title?: string; subtitle?: string } = $props();

  const win = getCurrentWindow();

  // The window is undecorated, so the whole bar is the drag handle; the control
  // buttons opt out via data-no-drag.
  function drag(event: MouseEvent) {
    if ((event.target as HTMLElement).closest('[data-no-drag]')) return;
    if (event.button !== 0) return;
    void win.startDragging();
  }

  /** Search belongs to the window, not to the library route: typing on the
      settings or book page must still find a book and bring the shelf back. */
  function onSearch(value: string): void {
    ui.query = value;
    if (!value.trim()) return;
    if (player.expanded) player.collapse();
    if (ui.route !== 'library') ui.route = 'library';
    // Home is a dashboard, not a result list. Keep series/authors/narrators
    // as the search context when the user was already browsing one of them.
    if (ui.libraryView === 'home') ui.setLibraryView('books');
  }

  // Ctrl+F works on every route because the field itself is always mounted.
  // Skip the initial pass so opening the app does not steal keyboard focus.
  $effect(() => {
    if (ui.focusSearch === 0) return;
    const el = document.getElementById('global-search') as HTMLInputElement | null;
    el?.focus();
    el?.select();
  });
</script>

<header
  class="titlebar"
  role="presentation"
  onmousedown={drag}
  ondblclick={() => void win.toggleMaximize()}
>
  <div class="titlebar__brand">
    <BrandMark size={22} label={t('app.name')} />
    <div class="titlebar__text">
      <span class="titlebar__title">{title}</span>
      {#if subtitle}
        <span class="titlebar__sub truncate">{subtitle}</span>
      {/if}
    </div>
  </div>

  <div class="titlebar__spacer"></div>

  <div class="titlebar__search" data-no-drag>
    <span class="titlebar__search-icon" aria-hidden="true"><Icon name="search" size={14} /></span>
    <input
      id="global-search"
      class="input"
      value={ui.query}
      oninput={event => onSearch(event.currentTarget.value)}
      onfocus={() => void preloadPinyin().then(() => (ui.pinyinReady = true))}
      placeholder={t('library.search')}
      title={t('library.searchHint')}
      aria-label={t('library.search')}
      spellcheck="false"
    />
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
      title={ui.closeToTray ? t('app.name') : undefined}
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
    min-width: var(--gap-inline);
  }

  /* Two equal spacers keep the field on the window centre line. It is part of
     the title bar, so it survives every route change and folded rail state. */
  .titlebar__search {
    position: relative;
    flex: 0 1 340px;
    min-width: 148px;
    max-width: 360px;
    -webkit-app-region: no-drag;
  }

  .titlebar__search-icon {
    position: absolute;
    left: 9px;
    top: 50%;
    transform: translateY(-50%);
    display: flex;
    color: var(--text-tertiary);
    pointer-events: none;
  }

  .titlebar__search .input {
    width: 100%;
    height: 30px;
    padding-left: 30px;
    font-size: var(--text-xs);
    background: var(--surface-inset);
  }

  .titlebar__search .input:focus {
    background: var(--surface);
  }

  @media (max-width: 780px) {
    .titlebar__username { display: none; }
    .titlebar__search { flex-basis: 200px; }
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
