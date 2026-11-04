<script lang="ts">
  import type { Snippet } from 'svelte';
  import { session, ui } from '../lib/state.svelte';
  import { player } from '../lib/player.svelte';
  import { t } from '../lib/i18n.svelte';
  import Titlebar from './Titlebar.svelte';
  import NowPlayingBar from './NowPlayingBar.svelte';
  import Icon from './Icon.svelte';

  let { children }: { children: Snippet } = $props();

  const subtitle = $derived(
    session.activeLibrary ? session.activeLibrary.name : t('app.name'),
  );

  /** Book and podcast screens are still "inside" the library for the nav. */
  const isBrowsing = $derived(
    ui.route === 'library' || ui.route === 'book' || ui.route === 'podcast',
  );

  const compact = $derived(ui.sidebarCompact);

  function go(route: 'library' | 'downloads' | 'settings' | 'admin'): void {
    player.collapse();
    ui.route = route;
  }
</script>

<Titlebar title={t('app.name')} subtitle={subtitle} />

<div class="shell">
  <nav class="rail" class:compact aria-label={t('nav.section.browse')}>
    <button
      class="rail__toggle"
      aria-label={compact ? t('nav.expand') : t('nav.collapse')}
      title={compact ? t('nav.expand') : t('nav.collapse')}
      onclick={() => ui.toggleSidebar()}
    >
      <Icon name={compact ? 'chevron-right' : 'chevron-left'} size={14} />
    </button>

    <button
      class="nav-item"
      aria-current={isBrowsing && !player.expanded ? 'page' : undefined}
      title={t('nav.library')}
      onclick={() => go('library')}
    >
      <span class="nav-item__icon"><Icon name="library" /></span>
      <span class="nav-item__label">{t('nav.library')}</span>
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

    <div class="rail__divider"></div>

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
          <Icon name={lib.mediaType === 'podcast' ? 'headphones' : 'book'} />
        </span>
        <span class="nav-item__label">{lib.name}</span>
      </button>
    {/each}

    <div class="rail__spacer"></div>

    {#if session.user?.type === 'root' || session.user?.type === 'admin'}
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
    gap: var(--gap-hair);
    width: 232px;
    flex: 0 0 232px;
    padding: var(--gap-row) var(--gap-inline) var(--gap-inline);
    border-right: 1px solid var(--hairline);
    background: var(--canvas);
    overflow-y: auto;
    transition: width var(--dur-2) var(--ease), flex-basis var(--dur-2) var(--ease);
  }

  .rail.compact {
    width: 58px;
    flex-basis: 58px;
    align-items: center;
    padding-inline: var(--gap-tight);
  }

  .rail__toggle {
    display: grid;
    place-items: center;
    align-self: flex-end;
    width: 22px;
    height: 22px;
    margin-bottom: var(--gap-inline);
    border-radius: var(--radius-xs);
    color: var(--text-tertiary);
  }

  .rail__toggle:hover {
    background: var(--surface-raised);
    color: var(--text);
  }

  .rail.compact .rail__toggle {
    align-self: center;
  }

  .rail__divider {
    height: 1px;
    width: 100%;
    margin: var(--gap-inline) var(--gap-inline);
    background: var(--hairline);
  }

  .rail__spacer {
    flex: 1 1 auto;
    min-height: var(--gap-block);
  }

  /* Compact rail: icon only, label revealed as a tooltip via `title`. */
  .rail.compact :global(.nav-item) {
    justify-content: center;
    padding-inline: 0;
    width: 40px;
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
