<script lang="ts">
  import type { Snippet } from 'svelte';
  import { library, progress, session, ui } from '../lib/state.svelte';
  import { player } from '../lib/player.svelte';
  import { t, type TranslationKey } from '../lib/i18n.svelte';
  import Titlebar from './Titlebar.svelte';
  import NowPlayingBar from './NowPlayingBar.svelte';
  import Icon from './Icon.svelte';
  import type { IconName } from './Icon.svelte';

  let { children }: { children: Snippet } = $props();

  type View = 'home' | 'books' | 'series' | 'authors' | 'narrators';
  type Route = 'library' | 'continue' | 'downloads' | 'settings' | 'admin';

  const VIEWS: { id: View; key: TranslationKey; icon: IconName }[] = [
    { id: 'home', key: 'library.home', icon: 'home' },
    { id: 'books', key: 'library.books', icon: 'book' },
    { id: 'series', key: 'library.series', icon: 'layers' },
    { id: 'authors', key: 'library.authors', icon: 'user' },
    { id: 'narrators', key: 'library.narrators', icon: 'mic' },
  ];

  const subtitle = $derived(session.activeLibrary?.name ?? t('app.name'));

  /**
   * The rail folds on its own when the window gets narrow. A manual toggle was
   * a second, silent mode that made "why is my sidebar a strip of icons?"
   * depend on a click made three sessions ago.
   */
  let narrow = $state(false);
  $effect(() => {
    const query = window.matchMedia('(max-width: 1040px)');
    const apply = () => (narrow = query.matches);
    apply();
    query.addEventListener('change', apply);
    return () => query.removeEventListener('change', apply);
  });
  const compact = $derived(narrow);
  const isBrowsing = $derived(
    ui.route === 'library' || ui.route === 'book' || ui.route === 'podcast',
  );
  const finishedCount = $derived(progress.rows.filter(row => row.isFinished).length);

  function go(route: Route): void {
    player.collapse();
    ui.route = route;
  }

  function selectView(view: View): void {
    player.collapse();
    ui.setLibraryView(view);
    ui.route = 'library';
  }
</script>

<Titlebar title={t('app.name')} {subtitle} />

<div class="shell">
  <nav class="rail" class:compact aria-label={t('nav.section.browse')}>
    <div class="rail__group">
      <span class="rail__label t-label">{t('nav.section.browse')}</span>
      <button
        class="nav-item"
        aria-current={isBrowsing && ui.libraryView === 'home' && !player.expanded ? 'page' : undefined}
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
          aria-current={player.expanded ? 'page' : undefined}
          title={t('nav.nowPlaying')}
          onclick={() => player.expand()}
        >
          <span class="nav-item__icon"><Icon name="headphones" /></span>
          <span class="nav-item__label">{t('nav.nowPlaying')}</span>
        </button>
      {/if}
    </div>

    <div class="rail__group">
      <span class="rail__label t-label">{t('nav.section.views')}</span>
      {#each VIEWS as entry (entry.id)}
        <button
          class="nav-item"
          aria-current={ui.route === 'library' && ui.libraryView === entry.id && !player.expanded ? 'page' : undefined}
          title={t(entry.key)}
          onclick={() => selectView(entry.id)}
        >
          <span class="nav-item__icon"><Icon name={entry.icon} /></span>
          <span class="nav-item__label">{t(entry.key)}</span>
        </button>
      {/each}
    </div>

    {#if session.libraries.length > 0}
      <div class="rail__group">
        <span class="rail__label t-label">{t('nav.section.libraries')}</span>
        {#each session.libraries as lib (lib.id)}
          <button
            class="nav-item"
            aria-current={lib.id === session.activeLibraryId && isBrowsing && !player.expanded ? 'page' : undefined}
            title={lib.name}
            onclick={() => {
              player.collapse();
              session.selectLibrary(lib.id);
              ui.route = 'library';
            }}
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

    <!-- A little texture at the bottom: the rail is no longer a large blank. -->
    {#if !compact}
      <div class="rail__stats t-num">
        <span class="t-small">{t('library.total', { count: library.items.length })}</span>
        <span class="t-small t-tertiary">{t('book.listened')} {finishedCount}</span>
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
    /* No horizontal scrollbar: long library names must ellipsise instead. */
    overflow-x: hidden;
    overflow-y: auto;
    scrollbar-width: thin;
    transition: width var(--dur-2) var(--ease), flex-basis var(--dur-2) var(--ease);
  }

  .rail.compact {
    width: 56px;
    flex-basis: 56px;
    align-items: center;
    padding-inline: 6px;
    gap: var(--gap-inline);
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

  .rail.compact .rail__label {
    display: none;
  }

  .rail.compact .rail__group {
    align-items: center;
  }

  .rail.compact .rail__group + .rail__group,
  .rail.compact .rail__group--foot {
    width: 38px;
  }

  .rail__spacer {
    flex: 1 1 auto;
    min-height: var(--gap-block);
  }

  .rail__stats {
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: var(--gap-inline) var(--gap-row);
    margin-bottom: 2px;
    border-radius: var(--radius-sm);
    background: var(--surface);
    border: 1px solid var(--hairline);
    color: var(--text-secondary);
  }

  /* The global .nav-item lives in design/components.css. Only its rail-specific
     geometry and the folded state are owned here. */
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

  .rail.compact :global(.nav-item__label) {
    display: none;
  }

  .rail.compact :global(.nav-item__icon) {
    margin: 0;
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
