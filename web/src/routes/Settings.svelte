<script lang="ts">
  import { onMount } from 'svelte';
  import { getVersion } from '@tauri-apps/api/app';
  import { ui } from '../lib/state.svelte';
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
  });

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
</style>

