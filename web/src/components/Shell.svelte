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
</script>

<Titlebar title={t('app.name')} subtitle={subtitle} />

<div class="shell">
  <nav class="rail" aria-label={t('nav.section.browse')}>
    <button
      class="nav-item"
      aria-current={isBrowsing && !player.expanded ? 'page' : undefined}
      onclick={() => {
        player.collapse();
        ui.route = 'library';
      }}
    >
      <span class="nav-item__icon"><Icon name="library" /></span>
      <span class="nav-item__label">{t('nav.library')}</span>
    </button>

    {#if player.item}
      <button
        class="nav-item"
        aria-current={player.expanded ? 'page' : undefined}
        onclick={() => player.expand()}
      >
        <span class="nav-item__icon"><Icon name="headphones" /></span>
        <span class="nav-item__label">{t('nav.nowPlaying')}</span>
      </button>
    {/if}

    <button
      class="nav-item"
      aria-current={ui.route === 'downloads' && !player.expanded ? 'page' : undefined}
      onclick={() => {
        player.collapse();
        ui.route = 'downloads';
      }}
    >
      <span class="nav-item__icon"><Icon name="download" /></span>
      <span class="nav-item__label">{t('nav.downloads')}</span>
    </button>

    <div class="rail__divider"></div>

    {#each session.libraries as lib (lib.id)}
      <button
        class="nav-item"
        aria-current={lib.id === session.activeLibraryId && isBrowsing && !player.expanded ? 'page' : undefined}
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
        onclick={() => {
          player.collapse();
          ui.route = 'admin';
        }}
      >
        <span class="nav-item__icon"><Icon name="server" /></span>
        <span class="nav-item__label">{t('nav.admin')}</span>
      </button>
    {/if}

    <button
      class="nav-item"
      aria-current={ui.route === 'settings' && !player.expanded ? 'page' : undefined}
      onclick={() => {
        player.collapse();
        ui.route = 'settings';
      }}
    >
      <span class="nav-item__icon"><Icon name="settings" /></span>
      <span class="nav-item__label">{t('nav.settings')}</span>
    </button>

    <div class="rail__account">
      <span class="rail__avatar">{(session.user?.username ?? '?').slice(0, 1).toUpperCase()}</span>
      <span class="truncate t-small">{session.user?.username ?? t('common.unknown')}</span>
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
    height: calc(100vh - 46px);
    min-height: 0;
  }

  .main-col {
    display: flex;
    flex-direction: column;
    flex: 1 1 auto;
    min-width: 0;
    min-height: 0;
  }

  .rail {
    display: flex;
    flex-direction: column;
    gap: var(--gap-hair);
    width: 224px;
    flex: 0 0 224px;
    padding: var(--gap-row) var(--gap-inline) var(--gap-inline);
    border-right: 1px solid var(--hairline);
    background: var(--canvas);
    overflow-y: auto;
  }

  .rail__divider {
    height: 1px;
    margin: var(--gap-inline) var(--gap-inline);
    background: var(--hairline);
  }

  .rail__spacer {
    flex: 1 1 auto;
    min-height: var(--gap-block);
  }

  .rail__account {
    display: flex;
    align-items: center;
    gap: var(--gap-inline);
    padding: var(--gap-inline) var(--gap-inline) var(--gap-tight);
    margin-top: var(--gap-inline);
    border-top: 1px solid var(--hairline);
    min-width: 0;
  }

  .rail__avatar {
    display: grid;
    place-items: center;
    width: 24px;
    height: 24px;
    flex: 0 0 auto;
    border-radius: 50%;
    background: var(--accent);
    color: var(--on-accent);
    font-size: var(--text-xs);
    font-weight: var(--weight-bold);
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
