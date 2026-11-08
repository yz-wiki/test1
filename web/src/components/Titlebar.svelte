<script lang="ts">
  import { getCurrentWindow } from '@tauri-apps/api/window';
  import { library, session, ui } from '../lib/state.svelte';
  import { player } from '../lib/player.svelte';
  import { preloadPinyin } from '../lib/search';
  import { BRAND } from '../lib/brand';
  import { t } from '../lib/i18n.svelte';
  import BrandMark from './BrandMark.svelte';
  import Icon from './Icon.svelte';
  import LibrarySwitcher from './LibrarySwitcher.svelte';
  import Dropdown from './Dropdown.svelte';

  let { title = BRAND.name }: { title?: string } = $props();

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
    // A search is a fresh context: an open group shelf would otherwise keep
    // its breadcrumb while the results came from the whole library.
    ui.focusGroup = null;
    if (player.expanded) player.collapse();
    if (ui.route !== 'library') ui.route = 'library';
    // Results render in place: on the dashboard the right-hand shelf becomes
    // the result list, and grouped views filter their own rows. Typing must
    // never bounce the dashboard to the books route.
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
  <div class="titlebar__left">
    <div class="titlebar__brand">
      <BrandMark size={22} label={t('app.name')} />
      <div class="titlebar__text">
        <span class="titlebar__title">{title}</span>
      </div>
    </div>

    <!-- The library switcher belongs beside the brand: it is window-level
         context, not a shelf filter. -->
    <div class="titlebar__lib" data-no-drag>
      <LibrarySwitcher />
    </div>
  </div>

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

  <!-- The shelf controls share the window chrome with the global field: one
       line owns the library context, the query and how the shelf is shown.
       Filter / sort are ui state, so this bar can own them on every route. -->
  <div class="titlebar__right">
  {#if ui.route === 'library'}
    <div class="titlebar__tools" data-no-drag>
      <span class="titlebar__count t-label t-num">
        {t('library.total', { count: library.items.length })}
      </span>

      <Dropdown
        value={ui.libraryFilter}
        options={[
          { value: 'all', label: t('library.filter.all') },
          { value: 'unfinished', label: t('library.filter.unfinished') },
          { value: 'finished', label: t('library.filter.finished') },
        ]}
        onSelect={next => ui.setLibraryFilter(next as 'all' | 'unfinished' | 'finished')}
        label={t('library.filter')}
      />

      <Dropdown
        value={ui.librarySort}
        options={[
          { value: 'recent', label: t('library.sort.recent') },
          { value: 'title', label: t('library.sort.title') },
          { value: 'author', label: t('library.sort.author') },
          { value: 'progress', label: t('library.sort.progress') },
        ]}
        onSelect={next => ui.setLibrarySort(next as 'recent' | 'title' | 'author' | 'progress')}
        label={t('library.sort')}
      />

      <div class="segmented segmented--tools" role="group" aria-label={t('library.layout.hint')}>
        <button
          class="segmented__item"
          aria-pressed={ui.libraryLayout === 'grid'}
          title={t('library.layout.grid')}
          onclick={() => ui.setLibraryLayout('grid')}
        ><Icon name="grid" size={13} /></button>
        <button
          class="segmented__item"
          aria-pressed={ui.libraryLayout === 'compact'}
          title={t('library.layout.compact')}
          onclick={() => ui.setLibraryLayout('compact')}
        ><Icon name="blocks" size={13} /></button>
        <button
          class="segmented__item"
          aria-pressed={ui.libraryLayout === 'list'}
          title={t('library.layout.list')}
          onclick={() => ui.setLibraryLayout('list')}
        ><Icon name="rows" size={13} /></button>
      </div>

    </div>
  {/if}

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

  /* Three tracks: left context, a genuinely window-centred search field, and
     the right-hand shelf tools + account + window buttons. `1fr auto 1fr`
     keeps the field on the centre line even when the rail folds, because the
     bar spans the whole window rather than the content column. */
  .titlebar {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
    align-items: center;
    gap: var(--gap-row);
    height: 46px;
    flex: 0 0 46px;
    padding: 0 var(--gap-block) 0 var(--gap-panel);
    border-bottom: 1px solid var(--hairline);
    background: var(--canvas);
    -webkit-app-region: drag;
  }

  .titlebar__left,
  .titlebar__right {
    display: flex;
    align-items: center;
    gap: var(--gap-row);
    min-width: 0;
  }

  .titlebar__left {
    justify-self: start;
  }

  .titlebar__right {
    justify-self: end;
    justify-content: flex-end;
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

  .titlebar__lib {
    display: flex;
    align-items: center;
    flex: 0 0 auto;
    min-width: 0;
    margin-left: 2px;
    -webkit-app-region: no-drag;
  }

  .titlebar__lib :global(.switcher__btn) {
    max-width: 150px;
    padding: 4px 7px;
    font-size: var(--text-xs);
    color: var(--text-secondary);
  }

  @media (max-width: 900px) {
    .titlebar__lib :global(.switcher__btn span) { display: none; }
  }

  .titlebar__search {
    position: relative;
    width: clamp(180px, 26vw, 340px);
    min-width: 0;
    justify-self: center;
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

  /* Shelf controls on the same line as the field. The title bar is the drag
     handle, so the whole group opts out; compact variants fit a 46px bar. */
  .titlebar__tools {
    display: flex;
    align-items: center;
    gap: 5px;
    flex: 0 0 auto;
    min-width: 0;
    -webkit-app-region: no-drag;
  }

  .titlebar__count {
    margin-right: 3px;
    white-space: nowrap;
    color: var(--text-tertiary);
  }

  .titlebar__tools :global(.drop__btn) {
    height: 30px;
    padding: 0 6px 0 8px;
    border: 1px solid var(--hairline);
    background: var(--surface-inset);
    font-size: var(--text-xs);
  }

  .titlebar__tools :global(.drop__btn:hover) {
    border-color: var(--hairline-strong);
  }

  .titlebar__tools :global(.segmented--tools) {
    padding: 2px;
  }

  /* Three equal, centred icon cells: the glyphs used to sit off-axis inside
     buttons whose width followed the icon rather than the control. */
  .titlebar__tools :global(.segmented__item) {
    display: grid;
    place-items: center;
    width: 28px;
    height: 24px;
    padding: 0;
    font-size: var(--text-2xs);
  }

  /* Drop information, never overlap it: the count goes first, then the two
     selects shrink, and on narrow windows only the layout switch remains
     (filter/sort still live in ui and are applied by the shelf). The shelf
     itself refreshes from the server's socket events, so there is no manual
     refresh button to protect. */
  @media (max-width: 1180px) {
    .titlebar__count { display: none; }
  }

  @media (max-width: 1240px) {
    .titlebar__search { width: clamp(170px, 22vw, 240px); }
    .titlebar__tools :global(.drop__value) {
      max-width: 62px;
      overflow: hidden;
      text-overflow: ellipsis;
    }
  }

  @media (max-width: 1080px) {
    /* The shelf filter/sort are still applied from ui state; the selects are
       the first thing to go so the centred field and layout switch survive. */
    .titlebar__tools :global(.drop) { display: none; }
  }

  @media (max-width: 780px) {
    .titlebar__username { display: none; }
    .titlebar__search { width: clamp(130px, 20vw, 190px); }
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
