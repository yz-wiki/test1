<script lang="ts">
  import { onMount } from 'svelte';
  import { getVersion } from '@tauri-apps/api/app';
  import { open } from '@tauri-apps/plugin-dialog';
  import { ACCENTS, CUSTOM_VARS, SCALES, THEMES, session, ui, type ThemeId } from '../lib/state.svelte';
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
  import Dropdown from '../components/Dropdown.svelte';
  import {
    getCacheDir,
    getDownloadsDir,
    logout,
    openLogDir,
    revealPath,
    setCacheDir,
    setDownloadsDir,
  } from '../lib/ipc';
  import { audioDevices } from '../lib/audioDevice.svelte';
  import EqPanel from '../components/EqPanel.svelte';
  import Icon from '../components/Icon.svelte';
import LogsPanel from '../components/LogsPanel.svelte';
  import { ACTIONS, bindingFromEvent, bindingLabel, keymap, type ActionId } from '../lib/keymap.svelte';

  /** Appearance + language are one concern (Display); account + server are
   *  one concern (Account & server). Fewer panes, less hunting. */
  type Section = 'display' | 'playback' | 'storage' | 'keyboard' | 'account' | 'logs' | 'about';

  type NavIcon = 'settings' | 'library' | 'headphones' | 'download' | 'clock' | 'book' | 'server' | 'activity' | 'palette' | 'globe';

  const SECTIONS: { id: Section; key: TranslationKey; desc: TranslationKey; icon: NavIcon }[] = [
    { id: 'display', key: 'settings.section.display', desc: 'settings.desc.display', icon: 'palette' },
    { id: 'playback', key: 'settings.section.playback', desc: 'settings.desc.playback', icon: 'headphones' },
    { id: 'storage', key: 'settings.section.storage', desc: 'settings.desc.storage', icon: 'download' },
    { id: 'keyboard', key: 'settings.section.keyboard', desc: 'settings.desc.keyboard', icon: 'clock' },
    { id: 'account', key: 'settings.section.account', desc: 'settings.desc.account', icon: 'book' },
    { id: 'logs', key: 'settings.section.logs', desc: 'settings.desc.logs', icon: 'activity' },
    { id: 'about', key: 'settings.section.about', desc: 'settings.desc.about', icon: 'settings' },
  ];

  const BASE_THEMES = THEMES.filter(id => id !== 'custom');

  const current = $derived(SECTIONS.find(entry => entry.id === section) ?? SECTIONS[0]);

  const THEME_KEYS: Record<ThemeId, TranslationKey> = {
    graphite: 'theme.graphite',
    slate: 'theme.slate',
    midnight: 'theme.midnight',
    nord: 'theme.nord',
    paper: 'theme.paper',
    daylight: 'theme.daylight',
    porcelain: 'theme.porcelain',
    sepia: 'theme.sepia',
    custom: 'theme.custom',
  };

  /** Preview swatch: canvas, surface, accent. */
  const THEME_SWATCHES: Record<ThemeId, [string, string, string]> = {
    graphite: ['#131316', '#23232d', '#8b7bf7'],
    slate: ['#17191c', '#282c32', '#5fb3a1'],
    midnight: ['#0d1117', '#1d2734', '#4c9aef'],
    nord: ['#2e3440', '#434c5e', '#88c0d0'],
    paper: ['#f4f3f6', '#ffffff', '#6b57e8'],
    daylight: ['#ffffff', '#eef2f8', '#2563eb'],
    porcelain: ['#eef1f6', '#fdfdfe', '#3358c9'],
    sepia: ['#f3ece0', '#fffaf3', '#a05f2c'],
    custom: ['#f5f7fb', '#ffffff', '#3b6ef5'],
  };

  // ── Keyboard map ────────────────────────────────────────────────────────
  // The list is data, not a hand-written table: the same ACTIONS array drives
  // the global listener and this screen, so a rebound key cannot drift from
  // what the app actually responds to.
  let recording = $state<{ id: ActionId; index: number } | null>(null);
  let keyConflict = $state<string | null>(null);

  function beginRecord(id: ActionId, index: number): void {
    recording = { id, index };
    keyConflict = null;
  }

  function actionLabel(id: ActionId): string {
    const action = ACTIONS.find(entry => entry.id === id);
    return action ? t(action.label) : id;
  }

  function onRecordKey(event: KeyboardEvent): void {
    if (!recording) return;
    event.preventDefault();
    event.stopPropagation();

    if (event.code === 'Escape') {
      recording = null;
      return;
    }
    if (event.code === 'Backspace') {
      const { id, index } = recording;
      if (index >= 0) {
        const binding = keymap.bindingsOf(id)[index];
        if (binding) keymap.remove(id, binding);
      }
      recording = null;
      return;
    }

    const binding = bindingFromEvent(event);
    if (!binding) return;
    const other = keymap.conflict(binding, recording.id);
    if (other) {
      keyConflict = t('keys.conflict', { action: actionLabel(other) });
      return;
    }
    if (recording.index < 0) keymap.add(recording.id, binding);
    else keymap.replace(recording.id, recording.index, binding);
    recording = null;
  }

  $effect(() => {
    if (!recording) return;
    const handler = (event: KeyboardEvent) => onRecordKey(event);
    window.addEventListener('keydown', handler, true);
    return () => window.removeEventListener('keydown', handler, true);
  });

  function initialSection(): Section {
    const raw = ui.settingsSection as string;
    if (raw === 'appearance' || raw === 'language') return 'display';
    if (raw === 'server') return 'account';
    const allowed: Section[] = ['display', 'playback', 'storage', 'keyboard', 'account', 'logs', 'about'];
    return allowed.includes(raw as Section) ? (raw as Section) : 'display';
  }

  let section = $state<Section>(initialSection());

  /** A colour input only accepts #rrggbb; anything else falls back safely. */
  function asHex(value: string): string {
    return /^#[0-9a-fA-F]{6}$/.test(value) ? value : '#888888';
  }

  // Remember the pane so the account chip and Ctrl+, land where they were.
  $effect(() => {
    ui.settingsSection = section;
  });
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
      [downloadsDir, cacheDir] = await Promise.all([
        getDownloadsDir(),
        getCacheDir(),
      ]);
      void audioDevices.refresh();
    } catch {
      // Devices are optional: a machine with no enumerable output still plays.
    }
    void sync.refresh(session.serverUrl);
  });

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

  /**
   * Both actions end at the sign-in screen. Keeping the host prefilled is the
   * difference between "another account on this server" and "another server".
   */
  async function switchAccount(keepServer: boolean): Promise<void> {
    const current = session.serverUrl;
    try {
      await logout();
    } finally {
      session.signOut();
      if (keepServer) localStorage.setItem('skald.serverUrl', current);
      ui.route = 'library';
    }
  }
</script>

{#snippet keyRow(action: (typeof ACTIONS)[number])}
  <div class="setting">
    <div class="setting__main">
      <span class="setting__label">{t(action.label)}</span>
      {#if keymap.isCustom(action.id)}
        <span class="setting__hint">{t('keys.customized')}</span>
      {/if}
    </div>
    <div class="setting__control keymap__chips">
      {#each keymap.bindingsOf(action.id) as binding, index (binding.code + index)}
        <button
          class="kbd kbd--key"
          class:recording={recording?.id === action.id && recording?.index === index}
          onclick={() => beginRecord(action.id, index)}
          title={t('keys.rebind')}
        >
          {recording?.id === action.id && recording?.index === index
            ? t('keys.press')
            : bindingLabel(binding)}
        </button>
      {/each}
      <button
        class="kbd kbd--add"
        class:recording={recording?.id === action.id && recording?.index === -1}
        onclick={() => beginRecord(action.id, -1)}
        title={t('keys.add')}
        aria-label={t('keys.add')}
      >
        {recording?.id === action.id && recording?.index === -1 ? t('keys.press') : '+'}
      </button>
      {#if keymap.isCustom(action.id)}
        <button
          class="keymap__reset"
          onclick={() => keymap.reset(action.id)}
          title={t('keys.reset')}
          aria-label={t('keys.reset')}
        >
          <Icon name="refresh" size={12} />
        </button>
      {/if}
    </div>
  </div>
{/snippet}

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
    <header class="pane__head">
      <h2 class="t-heading">{t(current.key)}</h2>
      <p class="t-small t-secondary">{t(current.desc)}</p>
    </header>

    {#if error}
      <p class="t-small form-error" role="alert">{error}</p>
    {/if}

    {#if section === 'display'}
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

        <div class="card__head">
          <span class="t-label">{t('settings.group.interface')}</span>
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
      <section class="card">
        <div class="card__body">
          <div class="setting">
            <div class="setting__main">
              <span class="setting__label">{t('settings.language')}</span>
              <span class="setting__hint">{t('settings.languageHint')}</span>
            </div>
            <div class="setting__control">
              <!-- Options come from the locale registry, so adding a language
                   later is one data row, not another button in a row that
                   stops fitting at four entries. -->
              <Dropdown
                value={getLocale()}
                options={LOCALES.map(locale => ({ value: locale, label: LOCALE_LABEL[locale] }))}
                onSelect={next => setLocale(next as Locale)}
                label={t('settings.language')}
                variant="field"
                width="152px"
              />
            </div>
          </div>
        </div>
      </section>
      <section class="card preview">
        <div class="card__head"><span class="t-label">{t('settings.preview')}</span></div>
        <div class="card__body">
          <p class="t-small t-tertiary preview__hint">{t('settings.previewHint')}</p>
          <div class="preview__frame">
            <div class="preview__rail">
              <span class="preview__line on"></span>
              <span class="preview__line"></span>
              <span class="preview__line"></span>
              <span class="preview__line short"></span>
            </div>
            <div class="preview__main">
              <span class="preview__title">{t('settings.previewSample')}</span>
              <div class="preview__cards">
                <span class="preview__card"></span>
                <span class="preview__card"></span>
                <span class="preview__card"></span>
              </div>
              <div class="preview__transport">
                <span class="preview__play"></span>
                <span class="preview__track"><span></span></span>
              </div>
            </div>
          </div>
        </div>
      </section>

    {#if ui.theme === 'custom'}
      <section class="card custom">
        <div class="card__head"><span class="t-label">{t('theme.editor')}</span></div>
        <div class="card__body">
          <p class="t-small t-tertiary custom__hint">{t('theme.editorHint')}</p>

          <div class="setting">
            <div class="setting__main">
              <span class="setting__label">{t('theme.base')}</span>
              <span class="setting__hint">{t('settings.theme')}</span>
            </div>
            <div class="setting__control">
              <Dropdown
                value={ui.customBase}
                options={BASE_THEMES.map(id => ({ value: id, label: t(THEME_KEYS[id]) }))}
                onSelect={next => ui.setCustomBase(next as ThemeId)}
                label={t('theme.base')}
                variant="field"
              />
            </div>
          </div>

          <div class="custom__grid">
            {#each CUSTOM_VARS as entry (entry.key)}
              <label class="custom__var">
                <span class="t-small">{t(entry.label)}</span>
                <span class="custom__picker">
                  <input
                    type="color"
                    value={asHex(ui.customVars[entry.key] ?? '#888888')}
                    aria-label={t(entry.label)}
                    oninput={event => ui.setCustomVar(entry.key, event.currentTarget.value)}
                  />
                  <input
                    class="input input--sm"
                    value={ui.customVars[entry.key] ?? ''}
                    spellcheck="false"
                    oninput={event => ui.setCustomVar(entry.key, event.currentTarget.value)}
                  />
                </span>
              </label>
            {/each}
          </div>

          <label class="field custom__css">
            <span class="field__label">{t('theme.css')}</span>
            <textarea
              class="textarea"
              rows="5"
              spellcheck="false"
              value={ui.customCss}
              oninput={event => ui.setCustomCss(event.currentTarget.value)}
            ></textarea>
            <span class="t-small t-tertiary">{t('theme.cssHint')}</span>
          </label>

          <button class="btn btn--quiet btn--sm" onclick={() => ui.resetCustom()}>
            {t('theme.reset')}
          </button>
        </div>
      </section>
    {/if}

    {:else if section === 'playback'}
      <section class="card">
        <div class="card__body">
          <div class="setting">
            <div class="setting__main">
              <span class="setting__label">{t('settings.audio')}</span>
              <span class="setting__hint">{t('settings.audioHint')}</span>
            </div>
            <div class="setting__control">
              <Dropdown
                value={audioDevices.current}
                options={[
                  { value: '', label: t('settings.audioDefault') },
                  ...audioDevices.options.filter(option => option.value !== ''),
                ]}
                onSelect={next => void audioDevices.choose(next)}
                label={t('settings.audio')}
                variant="field"
              />
            </div>
          </div>

          <div class="setting">
            <div class="setting__main">
              <span class="setting__label">{t('settings.defaultLayout')}</span>
              <span class="setting__hint">{t('settings.defaultLayoutHint')} · {t('library.layout.hint')}</span>
            </div>
            <div class="setting__control">
              <Dropdown
                value={ui.libraryLayout}
                options={[
                  { value: 'grid', label: t('library.layout.grid') },
                  { value: 'compact', label: t('library.layout.compact') },
                  { value: 'list', label: t('library.layout.list') },
                ]}
                onSelect={next => ui.setLibraryLayout(next as 'grid' | 'compact' | 'list')}
                label={t('settings.defaultLayout')}
                variant="field"
              />
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
        <div class="card__head keymap__head">
          <span class="t-label">{t('keys.playbackGroup')}</span>
          <span class="keymap__spacer"></span>
          <button class="btn btn--quiet btn--sm" onclick={() => keymap.resetAll()}>
            <Icon name="refresh" size={13} />
            {t('keys.resetAll')}
          </button>
        </div>
        <div class="card__body">
          {#each ACTIONS.filter(action => action.group === 'playback') as action (action.id)}
            {@render keyRow(action)}
          {/each}
        </div>
      </section>

      <section class="card">
        <div class="card__head">
          <span class="t-label">{t('keys.navigationGroup')}</span>
        </div>
        <div class="card__body">
          {#each ACTIONS.filter(action => action.group === 'navigation') as action (action.id)}
            {@render keyRow(action)}
          {/each}
        </div>
      </section>

      {#if keyConflict}
        <p class="t-small form-error" role="alert">{keyConflict}</p>
      {/if}
      <p class="t-small t-tertiary keymap__hint">{t('keys.hint')}</p>
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
              <span class="setting__label">{t('settings.role')}</span>
              <span class="setting__hint">{session.user?.type ?? t('common.unknown')}</span>
            </div>
          </div>

          {#if session.canManageServer}
            <div class="setting">
              <div class="setting__main">
                <span class="setting__label">{t('settings.openServer')}</span>
                <span class="setting__hint">{t('settings.openServerHint')}</span>
              </div>
              <div class="setting__control">
                <button class="btn btn--quiet btn--sm" onclick={() => (ui.route = 'admin')}>
                  {t('settings.open')}
                </button>
              </div>
            </div>
          {/if}

          <div class="setting">
            <div class="setting__main">
              <span class="setting__label">{t('settings.switchUser')}</span>
              <span class="setting__hint">{t('settings.switchUserHint')}</span>
            </div>
            <div class="setting__control">
              <button class="btn btn--quiet btn--sm" onclick={() => void switchAccount(true)}>
                {t('settings.switchUser')}
              </button>
            </div>
          </div>

          <div class="setting">
            <div class="setting__main">
              <span class="setting__label">{t('settings.switchServer')}</span>
              <span class="setting__hint">{t('settings.switchServerHint')}</span>
            </div>
            <div class="setting__control">
              <button class="btn btn--quiet btn--sm" onclick={() => void switchAccount(false)}>
                {t('settings.switchServer')}
              </button>
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

        </div>
      </section>
    {:else if section === 'logs'}
      <LogsPanel />
    {:else}
      <section class="card">
        <div class="card__body">
          <div class="setting">
            <div class="setting__main">
              <span class="setting__label">{t('settings.version')}</span>
              <span class="setting__hint">{t('app.name')} {version} · {t('app.former')}</span>
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

  .preview__hint {
    margin-bottom: var(--gap-row);
  }

  .preview__frame {
    display: flex;
    height: 132px;
    overflow: hidden;
    border-radius: var(--radius-sm);
    border: 1px solid var(--hairline);
    background: var(--canvas);
  }

  .preview__rail {
    display: flex;
    flex-direction: column;
    gap: 7px;
    width: 76px;
    flex: 0 0 76px;
    padding: 12px 9px;
    border-right: 1px solid var(--hairline);
  }

  .preview__line {
    height: 6px;
    border-radius: 3px;
    background: var(--text-tertiary);
    opacity: 0.35;
  }

  .preview__line.short {
    width: 60%;
  }

  .preview__line.on {
    background: var(--accent);
    opacity: 1;
  }

  .preview__main {
    display: flex;
    flex: 1 1 auto;
    flex-direction: column;
    gap: 10px;
    padding: 12px;
    min-width: 0;
  }

  .preview__title {
    font-size: var(--text-sm);
    font-weight: var(--weight-medium);
    color: var(--text);
  }

  .preview__cards {
    display: flex;
    gap: 8px;
  }

  .preview__card {
    width: 42px;
    height: 54px;
    border-radius: var(--radius-xs);
    background: var(--surface-raised);
    border: 1px solid var(--hairline);
  }

  .preview__card:first-child {
    background: var(--accent-soft);
    border-color: var(--accent-line);
  }

  .preview__transport {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-top: auto;
  }

  .preview__play {
    width: 18px;
    height: 18px;
    border-radius: 50%;
    background: var(--accent);
  }

  .preview__track {
    position: relative;
    flex: 1 1 auto;
    height: 4px;
    border-radius: var(--radius-pill);
    background: var(--surface-inset);
  }

  .preview__track > span {
    position: absolute;
    inset-block: 0;
    left: 0;
    width: 38%;
    border-radius: inherit;
    background: var(--accent);
  }

  .custom__hint {
    margin-bottom: var(--gap-row);
  }

  .custom__grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(190px, 1fr));
    gap: var(--gap-row);
    padding: var(--gap-row) 0;
  }

  .custom__var {
    display: flex;
    flex-direction: column;
    gap: 5px;
    color: var(--text-secondary);
  }

  .custom__picker {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .custom__picker input[type='color'] {
    width: 30px;
    height: 30px;
    flex: 0 0 30px;
    padding: 2px;
    border-radius: var(--radius-xs);
    border: 1px solid var(--hairline);
    background: var(--surface);
  }

  .custom__picker .input--sm {
    width: 100%;
    min-width: 0;
    font-family: ui-monospace, Consolas, monospace;
  }

  .custom__css {
    display: flex;
    flex-direction: column;
    gap: 5px;
  }

  .custom__css .textarea {
    font-family: ui-monospace, Consolas, monospace;
    font-size: var(--text-xs);
  }

  .pane__head {
    display: flex;
    flex-direction: column;
    gap: 2px;
    margin-bottom: var(--gap-inline);
  }

  .settings__body {
    width: 100%;
    max-width: 860px;
    margin-inline: auto;
    padding: var(--gap-block);
    min-height: 0;
    display: flex;
    flex-direction: column;
    gap: var(--gap-row);
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

  /* ── Keyboard map ─────────────────────────────────────────────────────── */
  .keymap__head {
    display: flex;
    align-items: center;
    gap: var(--gap-inline);
  }

  .keymap__spacer {
    flex: 1 1 auto;
  }

  .keymap__chips {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    flex-wrap: wrap;
    gap: 4px;
    min-width: 0;
  }

  .kbd--key,
  .kbd--add {
    cursor: pointer;
    transition: background var(--dur-1) var(--ease), border-color var(--dur-1) var(--ease),
      color var(--dur-1) var(--ease);
  }

  .kbd--key:hover,
  .kbd--add:hover {
    border-color: var(--accent-line);
    color: var(--text);
  }

  .kbd--add {
    min-width: 24px;
    padding-inline: 5px;
    color: var(--text-tertiary);
  }

  .kbd.recording {
    border-color: var(--accent);
    background: var(--accent-soft);
    color: var(--accent);
  }

  .keymap__reset {
    display: inline-grid;
    place-items: center;
    width: 22px;
    height: 22px;
    border-radius: var(--radius-xs);
    color: var(--text-tertiary);
    transition: background var(--dur-1) var(--ease), color var(--dur-1) var(--ease);
  }

  .keymap__reset:hover {
    background: var(--surface-raised);
    color: var(--text);
  }

  .keymap__hint {
    padding-inline: var(--gap-hair);
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
