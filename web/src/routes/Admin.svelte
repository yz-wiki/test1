<script lang="ts">
  import { onMount } from 'svelte';
  import { listen, type UnlistenFn } from '@tauri-apps/api/event';
  import { open as openDialog } from '@tauri-apps/plugin-dialog';
  import {
    resolveUploadFiles,
    uploadMedia,
    type UploadProgress,
  } from '../lib/ipc';
  import {
    createBackup,
    getBackups,
    getAllUsers,
    getLibrariesFull,
    getTasks,
    scanLibrary,
    type AdminLibrary,
    type AdminUserRow,
    type ServerBackup,
    type ServerTask,
  } from '../lib/ipc';
  import { session } from '../lib/state.svelte';
  import { t, type TranslationKey } from '../lib/i18n.svelte';
  import Dropdown from '../components/Dropdown.svelte';
  import Icon from '../components/Icon.svelte';
  import LogsPanel from '../components/LogsPanel.svelte';

  type Tab = 'libraries' | 'upload' | 'users' | 'tasks' | 'backups' | 'serverLogs';

  const TABS: { id: Tab; key: TranslationKey }[] = [
    { id: 'libraries', key: 'admin.libraries' },
    { id: 'upload', key: 'admin.upload' },
    { id: 'users', key: 'admin.users' },
    { id: 'tasks', key: 'admin.tasks' },
    { id: 'backups', key: 'admin.backups' },
    { id: 'serverLogs', key: 'admin.serverLogs' },
  ];

  const ROLES: Record<string, TranslationKey> = {
    root: 'admin.role.root',
    admin: 'admin.role.admin',
    user: 'admin.role.user',
    guest: 'admin.role.guest',
  };

  let tab = $state<Tab>('libraries');
  let libraries = $state<AdminLibrary[]>([]);
  let users = $state<AdminUserRow[]>([]);
  let tasks = $state<ServerTask[]>([]);
  let backups = $state<ServerBackup[]>([]);
  let backupLocation = $state('');
  let loading = $state(true);
  let scanning = $state<string | null>(null);
  let error = $state<string | null>(null);

  // ── Upload ────────────────────────────────────────────────────────────────
  let upLibrary = $state('');
  let upFolder = $state('');
  let upTitle = $state('');
  let upAuthor = $state('');
  let upSeries = $state('');
  let upFiles = $state<string[]>([]);
  type UploadMode = 'single' | 'split' | 'episode';
  let upMode = $state<UploadMode>('single');
  /** Single-episode mode: ABS only creates a new item on upload, so "attach"
      means naming a series (or a book) in that item's metadata. */
  let upTarget = $state<'book' | 'series'>('series');
  let upTargetName = $state('');
  let upRoot = $state('');
  let upBusy = $state(false);
  let upNotice = $state<string | null>(null);
  let upProgress = $state<UploadProgress | null>(null);
  let unlisten: UnlistenFn[] = [];

  const bookLibraries = $derived(libraries.filter(entry => entry.mediaType === 'book'));
  const upFolders = $derived(
    bookLibraries.find(entry => entry.id === upLibrary)?.folders ?? [],
  );

  function dirname(path: string): string {
    return path.replace(/\\/g, '/').split('/').filter(Boolean).pop() ?? '';
  }

  /**
   * A prepared folder tree (作者/系列/书名/01.mp3) is grouped by the file's
   * parent directory: one subfolder becomes one book, and the folder name is
   * the title. Without this, `resolveUploadFiles` flattens every track into a
   * single 1 000-chapter item.
   */
  const upBatches = $derived.by(() => {
    if (upMode !== 'split') return [] as { name: string; paths: string[] }[];
    const map = new Map<string, string[]>();
    for (const file of upFiles) {
      const parts = file.replace(/\\/g, '/').split('/').filter(Boolean);
      const name = parts.length >= 2 ? parts[parts.length - 2] : '_';
      const bucket = map.get(name);
      if (bucket) bucket.push(file);
      else map.set(name, [file]);
    }
    return [...map.entries()].map(([name, paths]) => ({ name, paths }));
  });

  onMount(() => {
    let disposed = false;
    void (async () => {
      const stops = await Promise.all([
        listen<UploadProgress>('upload-progress', ({ payload }) => {
          upProgress = payload;
        }),
        listen<{ title: string }>('upload-complete', ({ payload }) => {
          upNotice = t('upload.done', { title: payload.title });
          upProgress = null;
          upBusy = false;
        }),
      ]);
      // The screen can be torn down before listen() resolves.
      if (disposed) stops.forEach(stop => stop());
      else unlisten = stops;
    })();

    return () => {
      disposed = true;
      unlisten.forEach(stop => stop());
      unlisten = [];
    };
  });

  /** A whole audiobook is usually a folder of tracks, so the picker offers one. */
  async function pickFolder(): Promise<void> {
    const chosen = await openDialog({
      directory: true,
      multiple: false,
      title: t('upload.chooseFolder'),
    });
    if (typeof chosen !== 'string') return;
    try {
      const files = await resolveUploadFiles([chosen]);
      upFiles = files.map(file => file.path);
      upRoot = chosen;
      const rootName = chosen.split(/[\\/]/).filter(Boolean).pop() ?? '';
      if (upTitle.trim() === '') upTitle = rootName;
      if (upSeries.trim() === '') upSeries = rootName;
      // A tree with several subfolders is a batch of books, not one book.
      const parents = new Set(
        upFiles.map(file => file.replace(/\\/g, '/').split('/').filter(Boolean).slice(-2, -1)[0]),
      );
      if (parents.size > 1) upMode = 'split';
    } catch (reason) {
      error = (reason as Error).message;
    }
  }

  async function pickFiles(): Promise<void> {
    const chosen = await openDialog({
      multiple: true,
      title: t('upload.chooseFiles'),
      filters: [{ name: 'Audio', extensions: ['mp3', 'm4a', 'm4b', 'flac', 'ogg', 'opus', 'aac', 'wav'] }],
    });
    if (!chosen) return;
    upFiles = Array.isArray(chosen) ? chosen : [chosen];
  }

  async function startUpload(): Promise<void> {
    upNotice = null;
    if (!upLibrary || !upFolder || upFiles.length === 0) {
      error = t('upload.missing');
      return;
    }
    upBusy = true;
    error = null;
    try {
      if (upMode === 'split' && upBatches.length > 0) {
        for (const batch of upBatches) {
          await uploadMedia(
            session.serverUrl,
            crypto.randomUUID(),
            upLibrary,
            upFolder,
            batch.name,
            upAuthor.trim(),
            upSeries.trim() || (upRoot ? dirname(upRoot) : ''),
            batch.paths,
          );
        }
        upNotice = t('upload.groups', { count: upBatches.length });
      } else {
        const target = upTargetName.trim();
        await uploadMedia(
          session.serverUrl,
          crypto.randomUUID(),
          upLibrary,
          upFolder,
          upTarget === 'book' && target ? target : upTitle.trim() || t('common.unknown'),
          upAuthor.trim(),
          upTarget === 'series' && target ? target : upSeries.trim(),
          upFiles,
        );
      }
      upFiles = [];
      upTitle = '';
      upTargetName = '';
      upRoot = '';
      await load();
    } catch (reason) {
      error = (reason as Error).message;
    } finally {
      upBusy = false;
      upProgress = null;
    }
  }

  const isAdmin = $derived(
    session.user?.type === 'root' || session.user?.type === 'admin',
  );

  async function load(): Promise<void> {
    if (!session.serverUrl || !isAdmin) {
      loading = false;
      return;
    }
    loading = true;
    error = null;
    try {
      // Four independent server endpoints. A shape change in /api/tasks used
      // to reject the whole Promise.all and paint a bare decoder error across
      // the 书库 tab, even though the libraries had loaded fine.
      const [libs, people, taskList, backupList] = await Promise.allSettled([
        getLibrariesFull(session.serverUrl),
        getAllUsers(session.serverUrl),
        getTasks(session.serverUrl),
        getBackups(session.serverUrl),
      ]);
      let failures = 0;
      if (libs.status === 'fulfilled') libraries = libs.value;
      else failures += 1;
      if (people.status === 'fulfilled') users = people.value;
      else failures += 1;
      if (taskList.status === 'fulfilled') tasks = taskList.value.tasks ?? [];
      else failures += 1;
      if (backupList.status === 'fulfilled') {
        backups = backupList.value.backups ?? [];
        backupLocation = backupList.value.backupLocation ?? '';
      } else failures += 1;
      if (failures > 0) error = t('admin.partial');
    } catch (reason) {
      error = (reason as Error).message;
    } finally {
      loading = false;
    }
  }

  onMount(load);

  async function scan(library: AdminLibrary): Promise<void> {
    scanning = library.id;
    try {
      await scanLibrary(session.serverUrl, library.id, false);
      await load();
    } catch (reason) {
      error = (reason as Error).message;
    } finally {
      scanning = null;
    }
  }

  async function backup(): Promise<void> {
    try {
      const result = await createBackup(session.serverUrl);
      backups = result.backups ?? [];
      backupLocation = result.backupLocation ?? backupLocation;
    } catch (reason) {
      error = (reason as Error).message;
    }
  }

  function when(value: number | null | undefined): string {
    if (!value) return t('admin.never');
    return new Date(value).toLocaleString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  function size(bytes: number | undefined): string {
    if (!bytes) return '';
    const mb = bytes / 1048576;
    return mb >= 1024 ? `${(mb / 1024).toFixed(2)} GB` : `${mb.toFixed(0)} MB`;
  }
</script>

<div class="page scroll-y">
  <div class="head">
    <h1 class="t-title">{t('admin.title')}</h1>
    <div class="grow"></div>
    <button class="icon-btn" aria-label={t('admin.refresh')} title={t('admin.refresh')} onclick={() => void load()}>
      <Icon name="refresh" />
    </button>
  </div>

  {#if !isAdmin}
    <div class="empty">
      <Icon name="settings" size={26} />
      <span class="empty__title">{t('admin.adminOnly')}</span>
    </div>
  {:else}
    <div class="segmented">
      {#each TABS as entry (entry.id)}
        <button
          class="segmented__item"
          aria-pressed={tab === entry.id}
          onclick={() => (tab = entry.id)}
        >{t(entry.key)}</button>
      {/each}
    </div>

    {#if error}
      <p class="t-small form-error" role="alert">{error}</p>
    {/if}

    {#if loading}
      <p class="t-small t-tertiary">{t('admin.loading')}</p>
    {:else if tab === 'libraries'}
      {#if libraries.length === 0}
        <p class="t-small t-tertiary">{t('admin.empty')}</p>
      {/if}
      <ul class="rows">
        {#each libraries as library (library.id)}
          <li class="row">
            <span class="row__icon">
              <Icon name={library.mediaType === 'podcast' ? 'headphones' : 'book'} size={15} />
            </span>
            <span class="row__body">
              <span class="row__title truncate">{library.name}</span>
              <span class="t-small t-tertiary truncate">
                {t('admin.folders', { count: library.folders?.length ?? 0 })}
                · {library.lastScan
                  ? t('admin.lastScan', { when: when(library.lastScan) })
                  : t('admin.neverScanned')}
              </span>
            </span>
            <button
              class="btn btn--quiet btn--sm"
              disabled={scanning === library.id}
              onclick={() => void scan(library)}
            >{scanning === library.id ? t('admin.scanning') : t('admin.scan')}</button>
          </li>
        {/each}
      </ul>
    {:else if tab === 'upload'}
      <section class="card upload">
        <div class="card__body">
          <div class="upload__grid">
            <label class="field">
              <span class="field__label">{t('upload.library')}</span>
              <Dropdown
                value={upLibrary}
                options={[
                  { value: '', label: '—' },
                  ...bookLibraries.map(entry => ({ value: entry.id, label: entry.name })),
                ]}
                onSelect={next => {
                  upLibrary = next;
                  upFolder = '';
                }}
                label={t('upload.library')}
                variant="field"
                align="start"
              />
            </label>

            <label class="field">
              <span class="field__label">{t('upload.folder')}</span>
              <Dropdown
                value={upFolder}
                options={[
                  { value: '', label: '—' },
                  ...upFolders.map(folder => ({ value: folder.id, label: folder.fullPath })),
                ]}
                onSelect={next => (upFolder = next)}
                label={t('upload.folder')}
                variant="field"
                align="start"
              />
            </label>

            <label class="field">
              <span class="field__label">{t('upload.title')}</span>
              <input class="input" bind:value={upTitle} />
            </label>

            <label class="field">
              <span class="field__label">{t('upload.author')}</span>
              <input class="input" bind:value={upAuthor} />
            </label>

            <label class="field">
              <span class="field__label">{t('upload.series')}</span>
              <input class="input" bind:value={upSeries} />
            </label>

            <label class="field">
              <span class="field__label">{t('upload.structureMode')}</span>
              <Dropdown
                value={upMode}
                options={[
                  { value: 'single', label: t('upload.mode.single') },
                  { value: 'split', label: t('upload.mode.split') },
                  { value: 'episode', label: t('upload.mode.episode') },
                ]}
                onSelect={next => (upMode = next as UploadMode)}
                label={t('upload.structureMode')}
                variant="field"
                align="start"
              />
            </label>

            {#if upMode === 'episode'}
              <label class="field">
                <span class="field__label">{t('upload.target')}</span>
                <Dropdown
                  value={upTarget}
                  options={[
                    { value: 'book', label: t('upload.targetBook') },
                    { value: 'series', label: t('upload.targetSeries') },
                  ]}
                  onSelect={next => (upTarget = next as 'book' | 'series')}
                  label={t('upload.target')}
                  variant="field"
                  align="start"
                />
              </label>
              <label class="field">
                <span class="field__label">{upTarget === 'book' ? t('upload.targetBook') : t('upload.targetSeries')}</span>
                <input class="input" bind:value={upTargetName} />
              </label>
            {/if}
          </div>

          <p class="upload__hint t-small t-tertiary">{t('upload.mode.hint')}</p>
          {#if upBatches.length > 1}
            <p class="upload__detected t-small">
              {t('upload.detected')} · {t('upload.groups', { count: upBatches.length })}
            </p>
          {/if}

          <div class="upload__files">
            <button class="btn btn--quiet btn--sm" onclick={() => void pickFolder()}>
              {t('upload.chooseFolder')}
            </button>
            <button class="btn btn--quiet btn--sm" onclick={() => void pickFiles()}>
              {t('upload.chooseFiles')}
            </button>
            <span class="t-small t-tertiary truncate">
              {upFiles.length > 0 ? t('upload.selected', { count: upFiles.length }) : t('upload.none')}
            </span>
          </div>

          {#if upProgress}
            {@const pct = upProgress.totalBytes > 0
              ? Math.round((upProgress.bytesSent / upProgress.totalBytes) * 100)
              : 0}
            <div class="upload__progress">
              <span class="t-small t-tertiary">{t('upload.uploading', { pct })}</span>
              <span class="bar" aria-hidden="true"><span style:width="{pct}%"></span></span>
            </div>
          {/if}

          {#if upNotice}
            <p class="t-small t-accent">{upNotice}</p>
          {/if}

          <div class="upload__actions">
            <button
              class="btn btn--primary btn--sm"
              disabled={upBusy || upFiles.length === 0 || !upFolder}
              onclick={() => void startUpload()}
            >{upBusy ? t('upload.working') : t('upload.start')}</button>
            <span class="t-small t-tertiary">{t('upload.hint')}</span>
          </div>
        </div>
      </section>
    {:else if tab === 'users'}
      {#if users.length === 0}
        <p class="t-small t-tertiary">{t('admin.empty')}</p>
      {/if}
      <ul class="rows">
        {#each users as user (user.id)}
          <li class="row">
            <span class="row__icon">
              <span class="avatar">{(user.username ?? '?').slice(0, 1).toUpperCase()}</span>
            </span>
            <span class="row__body">
              <span class="row__title truncate">{user.username}</span>
              <span class="t-small t-tertiary truncate">
                {t(ROLES[user.type] ?? 'admin.role.user')}
                · {t('admin.lastSeen')} {when(user.lastSeen)}
                {#if user.isActive === false}· <span class="warn">{t('admin.disabled')}</span>{/if}
              </span>
            </span>
          </li>
        {/each}
      </ul>
    {:else if tab === 'tasks'}
      {#if tasks.length === 0}
        <p class="t-small t-tertiary">{t('admin.noTasks')}</p>
      {:else}
        <ul class="rows">
          {#each tasks as task (task.id)}
            <li class="row">
              <span class="row__icon">
                <span
                  class="dot"
                  class:running={!task.isFinished && !task.isFailed}
                  class:failed={task.isFailed}
                ></span>
              </span>
              <span class="row__body">
                <span class="row__title truncate">{task.title || task.action || task.id}</span>
                <span class="t-small t-tertiary truncate">{task.description || task.error || ''}</span>
              </span>
              <span class="t-small t-tertiary">
                {task.isFailed
                  ? t('admin.taskFailed')
                  : task.isFinished
                    ? t('admin.taskFinished')
                    : t('admin.taskRunning')}
              </span>
            </li>
          {/each}
        </ul>
      {/if}
    {:else if tab === 'serverLogs'}
      <LogsPanel scope="server" embedded />
    {:else}
      <div class="backup-head">
        <span class="t-small t-tertiary truncate">
          {t('admin.backupLocation')} · {backupLocation || '—'}
        </span>
        <button class="btn btn--quiet btn--sm" onclick={() => void backup()}>
          {t('admin.backupNow')}
        </button>
      </div>
      {#if backups.length === 0}
        <p class="t-small t-tertiary">{t('admin.noBackups')}</p>
      {:else}
        <ul class="rows">
          {#each backups as entry (entry.id)}
            <li class="row">
              <span class="row__body">
                <span class="row__title truncate">{entry.datePretty || entry.filename || entry.id}</span>
                <span class="t-small t-tertiary truncate">{entry.filename ?? ''}</span>
              </span>
              <span class="t-small t-num t-tertiary">{size(entry.fileSize)}</span>
            </li>
          {/each}
        </ul>
      {/if}
    {/if}
  {/if}
</div>

<style>
  .page {
    flex: 1 1 auto;
    min-height: 0;
    padding: var(--gap-block);
    display: flex;
    flex-direction: column;
    gap: var(--gap-row);
  }

  /* In a scrolling flex column, children default to flex-shrink:1 and get
     squeezed to a sliver once the content is taller than the viewport. */
  .page > * {
    flex: 0 0 auto;
  }

  .head {
    display: flex;
    align-items: baseline;
    gap: var(--gap-row);
  }

  .rows {
    display: flex;
    flex-direction: column;
    gap: 2px;
    list-style: none;
  }

  .row {
    display: flex;
    align-items: center;
    gap: var(--gap-row);
    padding: var(--gap-inline) var(--gap-row);
    border-radius: var(--radius-sm);
  }

  .row:hover {
    background: var(--surface-raised);
  }

  .row__icon {
    flex: 0 0 26px;
    display: grid;
    place-items: center;
    color: var(--text-tertiary);
  }

  .row__body {
    display: flex;
    flex-direction: column;
    gap: 1px;
    min-width: 0;
    flex: 1 1 auto;
  }

  .row__title {
    font-size: var(--text-sm);
    color: var(--text);
    font-weight: var(--weight-medium);
  }

  .avatar {
    display: grid;
    place-items: center;
    width: 24px;
    height: 24px;
    border-radius: 50%;
    background: var(--accent);
    color: var(--on-accent);
    font-size: var(--text-2xs);
    font-weight: var(--weight-bold);
  }

  .dot {
    display: block;
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--positive);
  }

  .dot.running {
    background: var(--warning);
  }

  .dot.failed {
    background: var(--danger);
  }

  .backup-head {
    display: flex;
    align-items: center;
    gap: var(--gap-row);
  }

  .backup-head .t-small {
    flex: 1 1 auto;
  }

  .warn {
    color: var(--warning);
  }

  .upload {
    max-width: 760px;
  }

  .upload__grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(230px, 1fr));
    gap: var(--gap-panel);
  }

  .upload__hint {
    margin: 0;
  }

  .upload__detected {
    color: var(--accent);
  }

  .upload__files {
    display: flex;
    align-items: center;
    gap: var(--gap-row);
    margin-top: var(--gap-block);
    padding: var(--gap-row);
    border: 1px dashed var(--hairline-strong);
    border-radius: var(--radius-sm);
  }

  .upload__progress {
    display: flex;
    flex-direction: column;
    gap: 4px;
    margin-top: var(--gap-row);
  }

  .upload__progress .bar {
    display: block;
    height: 4px;
    border-radius: var(--radius-pill);
    background: var(--surface-inset);
    overflow: hidden;
  }

  .upload__progress .bar > span {
    display: block;
    height: 100%;
    background: var(--accent);
  }

  .upload__actions {
    display: flex;
    align-items: center;
    gap: var(--gap-row);
    margin-top: var(--gap-block);
    padding-top: var(--gap-row);
    border-top: 1px solid var(--hairline);
  }

  .form-error {
    color: var(--danger);
  }
</style>
