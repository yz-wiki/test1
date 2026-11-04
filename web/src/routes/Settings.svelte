<script lang="ts">
  import { onMount } from 'svelte';
  import { getVersion } from '@tauri-apps/api/app';
  import { open } from '@tauri-apps/plugin-dialog';
  import { ACCENTS, SCALES, session, ui, type ThemeId } from '../lib/state.svelte';
  import { sync } from '../lib/sync.svelte';
  import {
    LOCALES,
    LOCALE_LABEL,
    getLocale,
    setLocale,
    t,
    type Locale,
    type TranslationKey,
  } from '../lib/i18n.svelte';
  import {
    getAudioDevices,
    getCacheDir,
    getDownloadsDir,
    logout,
    openLogDir,
    revealPath,
    setAudioDevice,
    setCacheDir,
    setDownloadsDir,
    type AudioDevice,
  } from '../lib/ipc';
  import EqPanel from '../components/EqPanel.svelte';
  import Icon from '../components/Icon.svelte';

  type Section =
    | 'appearance'
    | 'language'
    | 'playback'
    | 'storage'
    | 'keyboard'
    | 'account'
    | 'server'
    | 'about';

  type NavIcon = 'settings' | 'library' | 'headphones' | 'download' | 'clock' | 'book' | 'server';

  const SECTIONS: { id: Section; key: TranslationKey; icon: NavIcon }[] = [
    { id: 'appearance', key: 'settings.section.appearance', icon: 'settings' },
    { id: 'language', key: 'settings.section.language', icon: 'library' },
    { id: 'playback', key: 'settings.section.playback', icon: 'headphones' },
    { id: 'storage', key: 'settings.section.storage', icon: 'download' },
    { id: 'keyboard', key: 'settings.section.keyboard', icon: 'clock' },
    { id: 'account', key: 'settings.section.account', icon: 'book' },
    { id: 'server', key: 'settings.section.server', icon: 'server' },
    { id: 'about', key: 'settings.section.about', icon: 'settings' },
  ];

  const THEME_KEYS: Record<ThemeId, TranslationKey> = {
    graphite: 'theme.graphite',
    slate: 'theme.slate',
    midnight: 'theme.midnight',
    nord: 'theme.nord',
    paper: 'theme.paper',
    sepia: 'theme.sepia',
  };

  /** Preview swatch: canvas, surface, accent. */
  const THEME_SWATCHES: Record<ThemeId, [string, string, string]> = {
    graphite: ['#131316', '#23232d', '#8b7bf7'],
    slate: ['#17191c', '#282c32', '#5fb3a1'],
    midnight: ['#0d1117', '#1d2734', '#4c9aef'],
    nord: ['#2e3440', '#434c5e', '#88c0d0'],
    paper: ['#f6f5f7', '#ffffff', '#6b57e8'],
    sepia: ['#f3ece0', '#fffaf3', '#a05f2c'],
  };

  const SHORTCUTS: { keys: string; key: TranslationKey }[] = [
    { keys: 'Space / K', key: 'keys.playPause' },
    { keys: '← / →', key: 'keys.seek' },
    { keys: 'Shift + ← / →', key: 'keys.seekLong' },
    { keys: '[ / ]', key: 'keys.step' },
    { keys: 'Esc', key: 'keys.escape' },
    { keys: 'Ctrl + F', key: 'keys.search' },
    { keys: 'Ctrl + ,', key: 'keys.settings' },
  ];

  let section = $state<Section>('appearance');
  let devices = $state<AudioDevice[]>([]);
  let deviceId = $state('');
  let downloadsDir = $state('');
  let cacheDir = $state('');
  let version = $state('');
  let error = $state<string | null>(null);
  let flushed = $state<number | null>(null);

  onMount(async () => {
    try {
      version = await getVersion();
    } catch {
      version = '—';
    }
    try {
      [devices, downloadsDir, cacheDir] = await Promise.all([
        getAudioDevices(),
        getDownloadsDir(),
        getCacheDir(),
      ]);
    } catch {
      // Devices are optional: a machine with no enumerable output still plays.
    }
    void sync.refresh(session.serverUrl);
  });

  async function chooseDevice(id: string): Promise<void> {
    deviceId = id;
    try {
      await setAudioDevice(id);
    } catch (reason) {
      error = (reason as Error).message;
    }
  }

  async function pickFolder(which: 'downloads' | 'cache'): Promise<void> {
    const chosen = await open({
      directory: true,
      multiple: false,
      title: which === 'downloads' ? t('settings.downloadsDir') : t('settings.cacheDir'),
      defaultPath: which === 'downloads' ? downloadsDir : cacheDir,
    });
    if (typeof chosen !== 'string') return;
    try {
      if (which === 'downloads') {
        await setDownloadsDir(chosen);
        downloadsDir = chosen;
      } else {
        await setCacheDir(chosen);
        cacheDir = chosen;
      }
    } catch (reason) {
      error = (reason as Error).message;
    }
  }

  async function show(which: 'downloads' | 'cache'): Promise<void> {
    try {
      await revealPath(which === 'downloads' ? downloadsDir : cacheDir);
    } catch (reason) {
      error = (reason as Error).message;
    }
  }

  async function sendOffline(): Promise<void> {
    flushed = await sync.flush(session.serverUrl);
  }

  async function signOut(): Promise<void> {
    try {
      await logout();
    } finally {
      session.signOut();
    }
  }
</script>

<div class="settings">
  <nav class="settings__nav" aria-label={t('settings.title')}>
    <h1 class="t-title settings__title">{t('settings.title')}</h1>
    {#each SECTIONS as entry (entry.id)}
      <button
        class="nav-item"
        aria-current={section === entry.id ? 'page' : undefined}
        onclick={() => (section = entry.id)}
      >
        <span class="nav-item__icon"><Icon name={entry.icon} size={15} /></span>
        <span class="nav-item__label">{t(entry.key)}</span>
      </button>
    {/each}
  </nav>

  <div class="settings__body scroll-y">
    {#if error}
      <p class="t-small form-error" role="alert">{error}</p>
    {/if}

    {#if section === 'appearance'}
      <section class="card">
        <div class="card__head">
          <span class="t-label">{t('settings.theme')}</span>
        </div>
        <div class="card__body">
          <div class="theme-grid">
            {#each Object.keys(THEME_KEYS) as id (id)}
              {@const theme = id as ThemeId}
              <button
                class="theme"
                aria-pressed={ui.theme === theme}
                onclick={() => ui.setTheme(theme)}
              >
                <span class="theme__preview" style:background={THEME_SWATCHES[theme][0]}>
                  <span class="theme__dot" style:background={THEME_SWATCHES[theme][2]}></span>
                  <span class="theme__bar" style:background={THEME_SWATCHES[theme][1]}></span>
                </span>
                <span class="t-small">{t(THEME_KEYS[theme])}</span>
              </button>
            {/each}
          </div>
        </div>

        <div class="card__body">
          <div class="setting">
            <div class="setting__main">
              <span class="setting__label">{t('settings.accent')}</span>
              <span class="setting__hint">{t('settings.accentHint')}</span>
            </div>
            <div class="setting__control accent-row">
              <button
                class="accent accent--auto"
                aria-pressed={ui.accent === null}
                aria-label={t('settings.accentAuto')}
                title={t('settings.accentAuto')}
                onclick={() => ui.setAccent(null)}
              >A</button>
              {#each ACCENTS as colour (colour)}
                <button
                  class="accent"
                  style:background={colour}
                  aria-pressed={ui.accent === colour}
                  aria-label={colour}
                  title={colour}
                  onclick={() => ui.setAccent(colour)}
                ></button>
              {/each}
            </div>
          </div>

          <div class="setting">
            <div class="setting__main">
              <span class="setting__label">{t('settings.scale')}</span>
              <span class="setting__hint">{t('settings.scaleHint')}</span>
            </div>
            <div class="setting__control">
              <div class="segmented">
                {#each SCALES as scale (scale)}
                  <button
                    class="segmented__item"
                    aria-pressed={ui.scale === scale}
                    onclick={() => ui.setScale(scale)}
                  >{Math.round(scale * 100)}%</button>
                {/each}
              </div>
            </div>
          </div>

          <div class="setting">
            <div class="setting__main">
              <span class="setting__label">{t('settings.motion')}</span>
              <span class="setting__hint">{t('settings.motionHint')}</span>
            </div>
            <div class="setting__control">
              <button
                class="switch"
                role="switch"
                aria-checked={ui.reduceMotion}
                aria-label={t('settings.motion')}
                onclick={() => ui.setReduceMotion(!ui.reduceMotion)}
              ></button>
            </div>
          </div>

          <div class="setting">
            <div class="setting__main">
              <span class="setting__label">{t('settings.closeToTray')}</span>
              <span class="setting__hint">{t('settings.closeToTrayHint')}</span>
            </div>
            <div class="setting__control">
              <button
                class="switch"
                role="switch"
                aria-checked={ui.closeToTray}
                aria-label={t('settings.closeToTray')}
                onclick={() => ui.setCloseToTray(!ui.closeToTray)}
              ></button>
            </div>
          </div>
        </div>
      </section>
    {:else if section === 'language'}
      <section class="card">
        <div class="card__body">
          <div class="setting">
            <div class="setting__main">
              <span class="setting__label">{t('settings.language')}</span>
              <span class="setting__hint">{t('settings.languageHint')}</span>
            </div>
            <div class="setting__control">
              <div class="segmented">
                {#each LOCALES as locale (locale)}
                  <button
                    class="segmented__item"
                    aria-pressed={getLocale() === locale}
                    onclick={() => setLocale(locale as Locale)}
                  >{LOCALE_LABEL[locale]}</button>
                {/each}
              </div>
            </div>
          </div>
        </div>
      </section>
    {:else if section === 'playback'}
      <section class="card">
        <div class="card__body">
          <div class="setting">
            <div class="setting__main">
              <span class="setting__label">{t('settings.audio')}</span>
              <span class="setting__hint">{t('settings.audioHint')}</span>
            </div>
            <div class="setting__control">
              <select
                class="select"
                value={deviceId}
                onchange={event => void chooseDevice(event.currentTarget.value)}
              >
                <option value="">{t('settings.audioDefault')}</option>
                {#each devices as device (device.id)}
                  <option value={device.id}>{device.name}</option>
                {/each}
              </select>
            </div>
          </div>
        </div>
      </section>

      <h2 class="t-label section-title">{t('eq.title')}</h2>
      <EqPanel />
    {:else if section === 'storage'}
      <section class="card">
        <div class="card__body">
          <div class="setting">
            <div class="setting__main">
              <span class="setting__label">{t('settings.downloadsDir')}</span>
              <span class="setting__hint path">{downloadsDir || '—'}</span>
            </div>
            <div class="setting__control">
              <button class="btn btn--quiet btn--sm" onclick={() => void show('downloads')}>
                {t('settings.reveal')}
              </button>
              <button class="btn btn--quiet btn--sm" onclick={() => void pickFolder('downloads')}>
                {t('settings.choose')}
              </button>
            </div>
          </div>

          <div class="setting">
            <div class="setting__main">
              <span class="setting__label">{t('settings.cacheDir')}</span>
              <span class="setting__hint path">{cacheDir || '—'}</span>
            </div>
            <div class="setting__control">
              <button class="btn btn--quiet btn--sm" onclick={() => void show('cache')}>
                {t('settings.reveal')}
              </button>
              <button class="btn btn--quiet btn--sm" onclick={() => void pickFolder('cache')}>
                {t('settings.choose')}
              </button>
            </div>
          </div>
        </div>
      </section>
    {:else if section === 'keyboard'}
      <section class="card">
        <div class="card__body">
          {#each SHORTCUTS as row (row.keys)}
            <div class="setting">
              <div class="setting__main">
                <span class="setting__label">{t(row.key)}</span>
              </div>
              <div class="setting__control">
                <kbd class="kbd">{row.keys}</kbd>
              </div>
            </div>
          {/each}
        </div>
      </section>
    {:else if section === 'account'}
      <section class="card">
        <div class="card__body">
          <div class="setting">
            <div class="setting__main">
              <span class="setting__label">{session.user?.username ?? t('common.unknown')}</span>
              <span class="setting__hint">{session.serverUrl}</span>
            </div>
            <div class="setting__control">
              <span class="t-small t-tertiary">{session.user?.type ?? ''}</span>
            </div>
          </div>
          <div class="setting">
            <div class="setting__main">
              <span class="setting__label">{t('settings.signOut')}</span>
              <span class="setting__hint">{t('settings.signOutHint')}</span>
            </div>
            <div class="setting__control">
              <button class="btn btn--quiet btn--sm" onclick={() => void signOut()}>
                {t('settings.signOut')}
              </button>
            </div>
          </div>
        </div>
      </section>
    {:else if section === 'server'}
      <section class="card">
        <div class="card__body">
          <div class="setting">
            <div class="setting__main">
              <span class="setting__label">{t('sync.socket')}</span>
              <span class="setting__hint">
                <span class="dot" class:on={sync.socket === 'connected'} class:pending={sync.socket === 'connecting'}></span>
                {sync.socket === 'connected'
                  ? t('sync.connected')
                  : sync.socket === 'connecting'
                    ? t('sync.connecting')
                    : t('sync.offline')}
              </span>
            </div>
            <div class="setting__control">
              {#if sync.socket === 'connected'}
                <button class="btn btn--quiet btn--sm" onclick={() => void sync.disconnect()}>
                  {t('sync.disconnect')}
                </button>
              {:else}
                <button class="btn btn--quiet btn--sm" onclick={() => void sync.connect(session.serverUrl)}>
                  {t('sync.reconnect')}
                </button>
              {/if}
            </div>
          </div>

          <div class="setting">
            <div class="setting__main">
              <span class="setting__label">{t('sync.pending')}</span>
              <span class="setting__hint">
                {t('sync.pendingHint')}
                {#if flushed !== null && flushed > 0}
                  <span class="t-accent">{t('sync.flushed', { count: flushed })}</span>
                {/if}
              </span>
            </div>
            <div class="setting__control">
              <span class="t-num t-small t-tertiary">{sync.pending}</span>
              <button
                class="btn btn--quiet btn--sm"
                disabled={sync.busy || sync.pending === 0}
                onclick={() => void sendOffline()}
              >{t('sync.flush')}</button>
            </div>
          </div>

          <div class="setting">
            <div class="setting__main">
              <span class="setting__label">{t('sync.sessions')}</span>
              {#if sync.sessions.length === 0}
                <span class="setting__hint">{t('sync.sessionsEmpty')}</span>
              {:else}
                {#each sync.sessions as entry (entry.id)}
                  <span class="setting__hint">
                    {entry.displayTitle ?? entry.bookId ?? entry.id}
                    {#if entry.deviceInfo?.deviceName}· {entry.deviceInfo.deviceName}{/if}
                  </span>
                {/each}
              {/if}
            </div>
            <div class="setting__control">
              <button class="btn btn--quiet btn--sm" onclick={() => void sync.refresh(session.serverUrl)}>
                {t('sync.refresh')}
              </button>
            </div>
          </div>

          {#if session.user?.type === 'root' || session.user?.type === 'admin'}
            <div class="setting">
              <div class="setting__main">
                <span class="setting__label">{t('admin.title')}</span>
                <span class="setting__hint">{t('settings.adminHint')}</span>
              </div>
              <div class="setting__control">
                <button class="btn btn--quiet btn--sm" onclick={() => (ui.route = 'admin')}>
                  {t('settings.open')}
                </button>
              </div>
            </div>
          {/if}
        </div>
      </section>
    {:else}
      <section class="card">
        <div class="card__body">
          <div class="setting">
            <div class="setting__main">
              <span class="setting__label">{t('settings.version')}</span>
              <span class="setting__hint">Skald {version}</span>
            </div>
          </div>
          <div class="setting">
            <div class="setting__main">
              <span class="setting__label">{t('settings.logs')}</span>
              <span class="setting__hint">{t('settings.logsHint')}</span>
            </div>
            <div class="setting__control">
              <button class="btn btn--quiet btn--sm" onclick={() => void openLogDir()}>
                {t('settings.open')}
              </button>
            </div>
          </div>
        </div>
      </section>
    {/if}
  </div>
</div>

<style>
  .settings {
    display: grid;
    grid-template-columns: 208px minmax(0, 1fr);
    flex: 1 1 auto;
    min-height: 0;
  }

  .settings__nav {
    display: flex;
    flex-direction: column;
    gap: var(--gap-hair);
    padding: var(--gap-block) var(--gap-inline);
    border-right: 1px solid var(--hairline);
    min-height: 0;
    overflow-y: auto;
  }

  .settings__title {
    padding: 0 var(--gap-inline) var(--gap-row);
  }

  .settings__body {
    padding: var(--gap-block);
    min-height: 0;
    display: flex;
    flex-direction: column;
    gap: var(--gap-row);
    max-width: 760px;
  }

  /* Children of a scrolling column must not be squeezed — that is what made
     every card collapse to a 20px strip. */
  .settings__body > * {
    flex: 0 0 auto;
  }

  .section-title {
    margin-top: var(--gap-row);
  }

  .theme-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(128px, 1fr));
    gap: var(--gap-panel);
  }

  .theme {
    display: flex;
    flex-direction: column;
    gap: var(--gap-inline);
    padding: var(--gap-inline);
    border-radius: var(--radius-sm);
    border: 1px solid var(--hairline);
    text-align: left;
    color: var(--text-secondary);
  }

  .theme:hover {
    border-color: var(--hairline-strong);
  }

  .theme[aria-pressed='true'] {
    border-color: var(--accent);
    color: var(--text);
    background: var(--accent-soft);
  }

  .theme__preview {
    position: relative;
    display: block;
    height: 56px;
    border-radius: var(--radius-xs);
    border: 1px solid var(--hairline);
    overflow: hidden;
  }

  .theme__bar {
    position: absolute;
    inset: auto 6px 6px 6px;
    height: 8px;
    border-radius: var(--radius-pill);
    opacity: 0.85;
  }

  .theme__dot {
    position: absolute;
    left: 6px;
    top: 6px;
    width: 10px;
    height: 10px;
    border-radius: 50%;
  }

  .accent-row {
    display: flex;
    align-items: center;
    gap: var(--gap-inline);
    flex-wrap: wrap;
  }

  .accent {
    width: 22px;
    height: 22px;
    border-radius: 50%;
    border: 1px solid var(--hairline-strong);
  }

  .accent[aria-pressed='true'] {
    box-shadow: 0 0 0 2px var(--canvas), 0 0 0 3px var(--text);
  }

  .accent--auto {
    display: grid;
    place-items: center;
    background: var(--surface-inset);
    color: var(--text-tertiary);
    font-size: var(--text-2xs);
    font-weight: var(--weight-bold);
  }

  .path {
    font-family: var(--font-num);
    word-break: break-all;
  }

  .kbd {
    padding: 2px 8px;
    border-radius: var(--radius-xs);
    border: 1px solid var(--hairline-strong);
    background: var(--surface-inset);
    color: var(--text-secondary);
    font-family: var(--font-num);
    font-size: var(--text-xs);
    white-space: nowrap;
  }

  .dot {
    display: inline-block;
    width: 7px;
    height: 7px;
    margin-right: 6px;
    border-radius: 50%;
    background: var(--text-tertiary);
    vertical-align: middle;
  }

  .dot.on {
    background: var(--positive);
  }

  .dot.pending {
    background: var(--warning);
  }

  .form-error {
    color: var(--danger);
  }
</style>
