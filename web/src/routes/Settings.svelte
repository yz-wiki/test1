<script lang="ts">
  import { onMount } from 'svelte';
  import { getVersion } from '@tauri-apps/api/app';
  import { session, ui } from '../lib/state.svelte';
  import { sync } from '../lib/sync.svelte';
  import { LOCALES, LOCALE_LABEL, getLocale, setLocale, t, type Locale } from '../lib/i18n.svelte';
  import {
    getAudioDevices,
    getCacheDir,
    getDownloadsDir,
    openLogDir,
    revealPath,
    setAudioDevice,
    type AudioDevice,
  } from '../lib/ipc';
  import EqPanel from '../components/EqPanel.svelte';

  const themes = [
    { id: 'graphite', key: 'theme.graphite' },
    { id: 'paper', key: 'theme.paper' },
    { id: 'midnight', key: 'theme.midnight' },
  ] as const;

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
      // Devices are optional: a machine with no enumerable output still plays,
      // so a failure here is not worth an error banner.
    }
    void sync.refresh(session.serverUrl);
  });

  async function sendOffline(): Promise<void> {
    flushed = await sync.flush(session.serverUrl);
  }

  async function chooseDevice(id: string): Promise<void> {
    deviceId = id;
    try {
      await setAudioDevice(id);
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
</script>

<div class="page scroll-y">
  <h1 class="t-title" style="margin-bottom: var(--gap-block)">{t('settings.title')}</h1>

  <section class="card" style="max-width: 720px">
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

      <div class="setting">
        <div class="setting__main">
          <span class="setting__label">{t('settings.theme')}</span>
          <span class="setting__hint">{t('settings.themeHint')}</span>
        </div>
        <div class="setting__control">
          <div class="segmented">
            {#each themes as theme (theme.id)}
              <button
                class="segmented__item"
                aria-pressed={ui.theme === theme.id}
                onclick={() => ui.setTheme(theme.id)}
              >{t(theme.key)}</button>
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
    </div>
  </section>

  <h2 class="t-label section-title">{t('settings.playback')}</h2>
  <section class="card" style="max-width: 720px">
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

  <h2 class="t-label section-title">{t('settings.storage')}</h2>
  <section class="card" style="max-width: 720px">
    <div class="card__body">
      <div class="setting">
        <div class="setting__main">
          <span class="setting__label">{t('settings.downloadsDir')}</span>
          <span class="setting__hint mono">{downloadsDir || '—'}</span>
        </div>
        <div class="setting__control">
          <button class="btn btn--quiet btn--sm" onclick={() => void show('downloads')}>
            {t('settings.reveal')}
          </button>
        </div>
      </div>

      <div class="setting">
        <div class="setting__main">
          <span class="setting__label">{t('settings.cacheDir')}</span>
          <span class="setting__hint mono">{cacheDir || '—'}</span>
        </div>
        <div class="setting__control">
          <button class="btn btn--quiet btn--sm" onclick={() => void show('cache')}>
            {t('settings.reveal')}
          </button>
        </div>
      </div>
    </div>
  </section>

  <h2 class="t-label section-title">{t('sync.title')}</h2>
  <section class="card" style="max-width: 720px">
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
          <span class="setting__hint">{t('sync.pendingHint')}</span>
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

      <div class="setting setting--stack">
        <div class="setting__main">
          <span class="setting__label">{t('sync.sessions')}</span>
          {#if sync.sessions.length === 0}
            <span class="setting__hint">{t('sync.sessionsEmpty')}</span>
          {:else}
            <ul class="sessions">
              {#each sync.sessions as entry (entry.id)}
                <li class="session">
                  <span class="truncate">{entry.displayTitle ?? entry.bookId ?? entry.id}</span>
                  <span class="t-small t-tertiary truncate">
                    {entry.deviceInfo?.deviceName ?? entry.username ?? ''}
                  </span>
                </li>
              {/each}
            </ul>
          {/if}
        </div>
        <div class="setting__control">
          <button class="btn btn--quiet btn--sm" onclick={() => void sync.refresh(session.serverUrl)}>
            {t('sync.refresh')}
          </button>
        </div>
      </div>

      {#if flushed !== null && flushed > 0}
        <p class="t-small t-accent">{t('sync.flushed', { count: flushed })}</p>
      {/if}
    </div>
  </section>

  <h2 class="t-label section-title">{t('settings.about')}</h2>
  <section class="card" style="max-width: 720px">
    <div class="card__body">
      <div class="setting">
        <div class="setting__main">
          <span class="setting__label">{t('settings.version')}</span>
          <span class="setting__hint">Skald {version}</span>
        </div>
        <div class="setting__control">
          <button class="btn btn--quiet btn--sm" onclick={() => void openLogDir()}>
            {t('settings.openLog')}
          </button>
        </div>
      </div>
    </div>
  </section>

  {#if error}
    <p class="t-small form-error" role="alert">{error}</p>
  {/if}
</div>

<style>
  .page {
    flex: 1 1 auto;
    min-height: 0;
    padding: var(--gap-block);
    display: flex;
    flex-direction: column;
  }

  .section-title {
    margin: var(--gap-section) 0 var(--gap-row);
  }

  .mono {
    font-family: var(--font-num);
    word-break: break-all;
  }

  .form-error {
    color: var(--danger);
    margin-top: var(--gap-row);
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

  .setting--stack {
    align-items: flex-start;
  }

  .sessions {
    display: flex;
    flex-direction: column;
    gap: var(--gap-tight);
    list-style: none;
    margin-top: var(--gap-inline);
  }

  .session {
    display: flex;
    flex-direction: column;
    gap: 1px;
    padding: var(--gap-inline);
    border-radius: var(--radius-xs);
    background: var(--surface-inset);
    font-size: var(--text-sm);
  }
</style>

