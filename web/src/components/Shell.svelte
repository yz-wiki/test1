<script lang="ts">
  import type { Snippet } from 'svelte';
  import { library, progress, session, ui } from '../lib/state.svelte';
  import { player } from '../lib/player.svelte';
  import { goBack } from '../lib/navigation';
  import { t } from '../lib/i18n.svelte';
  import Titlebar from './Titlebar.svelte';
  import NowPlayingBar from './NowPlayingBar.svelte';
  import Icon from './Icon.svelte';

  let { children }: { children: Snippet } = $props();

  type View = 'home' | 'books' | 'series' | 'authors' | 'narrators';
  type Route = 'library' | 'continue' | 'downloads' | 'settings' | 'admin';

  /**
   * The rail has two shapes and only one of them is mounted at a time. The old
   * version kept one tree and hid labels with CSS while animating `width`, so
   * mid-transition the icons and group borders were still laid out for 226px
   * and showed through — the "half folded" ghosting in the screenshots.
   */
  let narrow = $state(false);
  $effect(() => {
    const query = window.matchMedia('(max-width: 1040px)');
    const apply = () => (narrow = query.matches);
    apply();
    query.addEventListener('change', apply);
    return () => query.removeEventListener('change', apply);
  });

  const compact = $derived(ui.railMode === 'closed' || (ui.railMode === 'auto' && narrow));
  const isBrowsing = $derived(
    ui.route === 'library' || ui.route === 'book' || ui.route === 'podcast',
  );
  const finishedCount = $derived(progress.rows.filter(row => row.isFinished).length);
  const homeActive = $derived(isBrowsing && ui.libraryView === 'home' && !player.expanded);
  const nowActive = $derived(player.expanded);

  function go(route: Route): void {
    player.collapse();
    ui.route = route;
  }

  function selectView(view: View): void {
    player.collapse();
    ui.setLibraryView(view);
    ui.route = 'library';
  }

  /** Entering a library should land on its books, not on the dashboard. */
  function enterLibrary(id: string): void {
    player.collapse();
    session.selectLibrary(id);
    if (ui.libraryView === 'home') ui.setLibraryView('books');
    ui.route = 'library';
  }

  function collapseRail(): void {
    ui.setRail('closed');
  }

  function expandRail(): void {
    ui.setRail(narrow ? 'auto' : 'open');
  }
</script>

<Titlebar title={t('app.name')} />

<div class="shell">
  <nav class="rail" class:compact aria-label={t('nav.section.browse')}>
    <!-- The top slot belongs to navigation, not to layout. "Back" unwinds
         the same stack as Esc; the fold toggle moved to the foot of the rail
         and became a hamburger so it no longer reads as a second arrow. -->
    <div class="rail__head">
      <button
        class="rail__back"
        aria-label={t('nav.back')}
        title={t('nav.back')}
        onclick={() => void goBack()}
      >
        <Icon name="arrow-left" size={14} />
        {#if !compact}<span class="rail__head-text truncate">{t('nav.back')}</span>{/if}
      </button>
    </div>

    {#if compact}
      <div class="rail__icons">
        <button
          class="nav-item"
          aria-current={homeActive ? 'page' : undefined}
          title={t('library.home')}
          onclick={() => selectView('home')}
        >
          <span class="nav-item__icon"><Icon name="home" /></span>
        </button>

        <button
          class="nav-item"
          aria-current={ui.route === 'continue' && !player.expanded ? 'page' : undefined}
          title={t('nav.continue')}
          onclick={() => go('continue')}
        >
          <span class="nav-item__icon"><Icon name="play" /></span>
        </button>

        {#if player.item}
          <button
            class="nav-item"
            aria-current={nowActive ? 'page' : undefined}
            title={t('nav.nowPlaying')}
            onclick={() => player.expand()}
          >
            <span class="nav-item__icon"><Icon name="headphones" /></span>
          </button>
        {/if}

        <span class="rail__rule"></span>

        {#each session.libraries as lib (lib.id)}
          <button
            class="nav-item"
            aria-current={lib.id === session.activeLibraryId && isBrowsing && !player.expanded ? 'page' : undefined}
            title={lib.name}
            onclick={() => enterLibrary(lib.id)}
          >
            <span class="nav-item__icon">
              <Icon name={lib.mediaType === 'podcast' ? 'headphones' : 'library'} />
            </span>
          </button>
        {/each}

        <span class="rail__spacer"></span>

        {#if session.canManageServer}
          <button
            class="nav-item"
            aria-current={ui.route === 'admin' && !player.expanded ? 'page' : undefined}
            title={t('nav.admin')}
            onclick={() => go('admin')}
          >
            <span class="nav-item__icon"><Icon name="server" /></span>
          </button>
        {/if}

        <button
          class="nav-item"
          aria-current={ui.route === 'downloads' && !player.expanded ? 'page' : undefined}
          title={t('nav.downloads')}
          onclick={() => go('downloads')}
        >
          <span class="nav-item__icon"><Icon name="download" /></span>
        </button>

        <button
          class="nav-item"
          aria-current={ui.route === 'settings' && !player.expanded ? 'page' : undefined}
          title={t('nav.settings')}
          onclick={() => go('settings')}
        >
          <span class="nav-item__icon"><Icon name="settings" /></span>
        </button>
      </div>
    {:else}

      <div class="rail__group">
        <span class="rail__label t-label">{t('nav.section.browse')}</span>
        <button
          class="nav-item"
          aria-current={homeActive ? 'page' : undefined}
          title={t('library.home')}
          onclick={() => selectView('home')}
        >
          <span class="nav-item__icon"><Icon name="home" /></span>
          <span class="nav-item__label">{t('library.home')}</span>
        </button>

        <button
          class="nav-item"
          aria-current={ui.route === 'continue' && !player.expanded ? 'page' : undefined}
          title={t('nav.continue')}
          onclick={() => go('continue')}
        >
          <span class="nav-item__icon"><Icon name="play" /></span>
          <span class="nav-item__label">{t('nav.continue')}</span>
        </button>

        {#if player.item}
          <button
            class="nav-item"
            aria-current={nowActive ? 'page' : undefined}
            title={t('nav.nowPlaying')}
            onclick={() => player.expand()}
          >
            <span class="nav-item__icon"><Icon name="headphones" /></span>
            <span class="nav-item__label">{t('nav.nowPlaying')}</span>
          </button>
        {/if}
      </div>

      {#if session.libraries.length > 0}
        <div class="rail__group">
          <span class="rail__label t-label">{t('nav.section.libraries')}</span>
          {#each session.libraries as lib (lib.id)}
            <button
              class="nav-item"
              aria-current={lib.id === session.activeLibraryId && isBrowsing && !player.expanded ? 'page' : undefined}
              title={lib.name}
              onclick={() => enterLibrary(lib.id)}
            >
              <span class="nav-item__icon">
                <Icon name={lib.mediaType === 'podcast' ? 'headphones' : 'library'} />
              </span>
              <span class="nav-item__label">{lib.name}</span>
            </button>
          {/each}
        </div>
      {/if}

      <div class="rail__spacer"></div>

      {#if library.items.length > 0}
        <!-- Was a bordered card with two bare lines ("书库共 41 本" / "已听 1")
             floating at the foot of the rail, reading as a stray tooltip.
             A quiet row with a completion bar says the same thing and belongs
             to the rail. -->
        <div class="rail__stats">
          <div class="rail__stats-head">
            <span class="t-small">{t('book.listened')}</span>
            <span class="t-small t-num t-tertiary">{finishedCount} / {library.items.length}</span>
          </div>
          <div class="rail__stats-bar" aria-hidden="true">
            <span style:width="{Math.round((finishedCount / library.items.length) * 100)}%"></span>
          </div>
        </div>
      {/if}

      <div class="rail__group rail__group--foot">
        <span class="rail__label t-label">{t('nav.section.system')}</span>
        {#if session.canManageServer}
          <button
            class="nav-item"
            aria-current={ui.route === 'admin' && !player.expanded ? 'page' : undefined}
            title={t('nav.admin')}
            onclick={() => go('admin')}
          >
            <span class="nav-item__icon"><Icon name="server" /></span>
            <span class="nav-item__label">{t('nav.admin')}</span>
          </button>
        {/if}

        <button
          class="nav-item"
          aria-current={ui.route === 'downloads' && !player.expanded ? 'page' : undefined}
          title={t('nav.downloads')}
          onclick={() => go('downloads')}
        >
          <span class="nav-item__icon"><Icon name="download" /></span>
          <span class="nav-item__label">{t('nav.downloads')}</span>
        </button>

        <button
          class="nav-item"
          aria-current={ui.route === 'settings' && !player.expanded ? 'page' : undefined}
          title={t('nav.settings')}
          onclick={() => go('settings')}
        >
          <span class="nav-item__icon"><Icon name="settings" /></span>
          <span class="nav-item__label">{t('nav.settings')}</span>
        </button>
      </div>
    {/if}

    <div class="rail__foot">
      <button
        class="rail__menu"
        aria-label={compact ? t('nav.expand') : t('nav.collapse')}
        title={compact ? t('nav.expand') : t('nav.collapse')}
        onclick={compact ? expandRail : collapseRail}
      >
        <Icon name="menu" size={15} />
        {#if !compact}<span class="rail__foot-text truncate">{t('nav.menu')}</span>{/if}
      </button>
    </div>
  </nav>

  <div class="main-col">
    <main class="content">
      {@render children()}
    </main>

    <!-- The transport lives outside the routed content: it survives navigation
         and there is only ever one of it. -->
    {#if !player.expanded}
      <NowPlayingBar />
    {/if}
  </div>
</div>

<style>
  .shell {
    display: flex;
    height: calc((100vh / var(--ui-scale, 1)) - 46px);
    min-height: 0;
  }

  .rail {
    position: relative;
    display: flex;
    flex-direction: column;
    gap: var(--gap-row);
    width: 226px;
    flex: 0 0 226px;
    min-width: 0;
    padding: var(--gap-inline) var(--gap-inline) var(--gap-block);
    border-right: 1px solid var(--hairline);
    background: var(--canvas);
    overflow-x: hidden;
    overflow-y: auto;
    scrollbar-width: thin;
    transition: width var(--dur-1) var(--ease), flex-basis var(--dur-1) var(--ease);
  }

  .rail.compact {
    width: 56px;
    flex-basis: 56px;
    padding-inline: 6px;
    overflow: hidden;
  }

  .rail__head {
    display: flex;
    justify-content: flex-start;
    align-items: center;
    width: 100%;
    min-height: 26px;
  }

  .rail.compact .rail__head {
    justify-content: center;
  }

  .rail__back {
    display: inline-flex;
    align-items: center;
    gap: var(--gap-inline);
    min-width: 0;
    height: 26px;
    padding: 0 6px;
    border-radius: var(--radius-xs);
    color: var(--text-secondary);
    font-size: var(--text-xs);
  }

  .rail__back:hover {
    background: var(--surface-raised);
    color: var(--text);
  }

  .rail.compact .rail__back {
    justify-content: center;
    width: 30px;
    padding: 0;
  }

  .rail__head-text {
    max-width: 130px;
  }

  /* Fold control: a hamburger at the foot, present in both shapes so folding
     never moves the control that unfolds it. */
  .rail__foot {
    display: flex;
    align-items: center;
    width: 100%;
    padding-top: var(--gap-inline);
    border-top: 1px solid var(--hairline);
  }

  .rail__menu {
    display: inline-flex;
    align-items: center;
    gap: var(--gap-inline);
    width: 100%;
    min-width: 0;
    height: 30px;
    padding: 0 8px;
    border-radius: var(--radius-xs);
    color: var(--text-tertiary);
    font-size: var(--text-xs);
  }

  .rail__menu:hover {
    background: var(--surface-raised);
    color: var(--text);
  }

  .rail.compact .rail__menu {
    justify-content: center;
    padding: 0;
  }

  .rail__foot-text {
    min-width: 0;
  }

  .rail__icons {
    display: flex;
    flex: 1 1 auto;
    flex-direction: column;
    align-items: center;
    gap: 2px;
    width: 100%;
    min-height: 0;
  }

  .rail__rule {
    width: 22px;
    height: 1px;
    margin: var(--gap-inline) 0;
    background: var(--hairline);
  }

  .rail__group {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
    width: 100%;
  }

  .rail__group + .rail__group {
    padding-top: var(--gap-inline);
    border-top: 1px solid var(--hairline);
  }

  .rail__group--foot {
    padding-top: var(--gap-inline);
    border-top: 1px solid var(--hairline);
  }

  .rail__label {
    padding: 2px var(--gap-row) var(--gap-inline);
    color: var(--text-tertiary);
    font-size: var(--text-2xs);
    letter-spacing: 0.08em;
  }

  .rail__spacer {
    flex: 1 1 auto;
    min-height: var(--gap-block);
  }

  .rail__stats {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: var(--gap-inline) var(--gap-row);
    margin-bottom: 2px;
    color: var(--text-tertiary);
  }

  .rail__stats-head {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: var(--gap-inline);
    white-space: nowrap;
  }

  .rail__stats-bar {
    height: 3px;
    border-radius: var(--radius-pill);
    background: var(--surface-inset);
    overflow: hidden;
  }

  .rail__stats-bar > span {
    display: block;
    height: 100%;
    border-radius: inherit;
    background: var(--accent);
  }

  /* The global .nav-item lives in design/components.css. Only its rail-specific
     geometry is owned here; the folded shape is a separate tree, so no label
     ever has to be hidden. */
  .rail :global(.nav-item__label) {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .rail.compact :global(.nav-item) {
    justify-content: center;
    width: 38px;
    min-width: 38px;
    padding-inline: 0;
  }

  .main-col {
    display: flex;
    flex-direction: column;
    flex: 1 1 auto;
    min-width: 0;
    min-height: 0;
  }

  .content {
    flex: 1 1 auto;
    min-width: 0;
    min-height: 0;
    display: flex;
    flex-direction: column;
    background: var(--canvas);
  }
</style>
