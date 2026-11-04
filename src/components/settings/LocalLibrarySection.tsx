import { useState, useEffect, useCallback } from 'react';
import { useI18n } from '../../i18n';
import { open } from '@tauri-apps/plugin-dialog';
import { listen } from '@tauri-apps/api/event';
import type { OnyxState } from '../../state/onyx';
import type { Library, ScannedItem } from '../../api/abs';
import { createLocalLibrary, deleteLocalLibrary, scanLocalLibrary, getUnidentifiedItems, revealPath } from '../../api/abs';
import { log } from '../../lib/log';
import Icon from '../Icon';
import { SectionHead, Panel, MONO, DIM_GOLD, TextInput } from './shared';
import MatchModal, { makeLocalQuarantineAdapter } from '../MatchModal';
import LocalImportDialog from '../LocalImportDialog';

// A glass chip showing a folder path; clicking opens it in the OS file explorer.
// Used for the library root and staging paths so they align and are actionable.
function PathChip({ label, hint, path }: { label: string; hint?: string; path: string }) {
  return (
    <button
      onClick={() => revealPath(path).catch(e => log.error('library', 'reveal path failed', { err: String(e) }))}
      title={`Open ${path}`}
      style={{
        display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 'var(--s-1)',
        width: '100%', boxSizing: 'border-box', textAlign: 'left', cursor: 'pointer',
        padding: 'var(--s-2) var(--s-3)', borderRadius: 'var(--r-md)',
        background: 'var(--onyx-glass)', border: '1px solid var(--onyx-glass-edge)',
        transition: 'background 0.12s, border-color 0.12s',
      }}
      onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.06)'; e.currentTarget.style.borderColor = 'var(--onyx-accent-edge)'; }}
      onMouseLeave={e => { e.currentTarget.style.background = 'var(--onyx-glass)'; e.currentTarget.style.borderColor = 'var(--onyx-glass-edge)'; }}
    >
      <span style={{ display: 'flex', alignItems: 'center', gap: 'var(--s-2)' }}>
        <span style={{ fontFamily: MONO, fontSize: 'var(--fs-0)', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--onyx-text-mute)' }}>{label}</span>
        {hint && <span style={{ fontSize: 'var(--fs-0)', color: 'var(--onyx-text-mute)', opacity: 0.85 }}>{hint}</span>}
      </span>
      <span style={{ fontFamily: MONO, fontSize: 'var(--fs-2)', color: 'var(--onyx-text-dim)', maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {path}
      </span>
    </button>
  );
}

// Local Library settings (Local Library & Split Libraries roadmap, Phase 2/3).
// Create a local library from a folder on disk, (re)scan it into the catalog, and
// switch to it. Unlike the ABS Libraries section this is always available — local
// libraries are a client-side concept and require neither a server nor admin.
// `embedded` hides the SectionHead so the section can be hosted inside another
// pane (LibraryManagementSection's combined "Libraries" view).
export interface LocalLibrarySectionProps { st: OnyxState; embedded?: boolean; }

export default function LocalLibrarySection({ st, embedded = false }: LocalLibrarySectionProps) {
  const { t } = useI18n();
  // Busy id: the library currently scanning (or '__new__' while adding), so the
  // relevant button shows a spinner and is disabled.
  const [busy, setBusy] = useState<string | null>(null);
  const [scanProgress, setScanProgress] = useState<Record<string, { phase: string; processed: number; total: number; currentItem?: string }>>({});
  // Quarantined books per library (from <root>/_Unidentified), and the active
  // match-modal target.
  const [unidentified, setUnidentified] = useState<Record<string, ScannedItem[]>>({});
  const [matchTarget, setMatchTarget] = useState<{ libId: string; item: ScannedItem } | null>(null);
  // Library targeted by the shared Files / Folder / Staging import dialog.
  const [importLibrary, setImportLibrary] = useState<Library | null>(null);
  // Inline "create library" form state.
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [newParent, setNewParent] = useState<string | null>(null);
  // Media type of the library to create: audiobooks (folder-scanned) or podcasts
  // (RSS-subscribed). Podcast libraries route to the podcast browse UI.
  const [newType, setNewType] = useState<'book' | 'podcast'>('book');

  const locals: Library[] = st.libraries.filter(l => l.source === 'local');

  const reloadUnidentified = useCallback(async () => {
    const locs = st.libraries.filter(l => l.source === 'local');
    const map: Record<string, ScannedItem[]> = {};
    await Promise.all(locs.map(async l => {
      try { map[l.id] = await getUnidentifiedItems(l.id); } catch { map[l.id] = []; }
    }));
    setUnidentified(map);
  }, [st.libraries]);

  // The needs-attention list re-loads automatically whenever the library set
  // changes (App's app-wide staging watcher calls refreshLibrary after an
  // auto-distribute, which re-runs this). The OS watcher itself lives in App.tsx.
  useEffect(() => { void reloadUnidentified(); }, [reloadUnidentified]);

  useEffect(() => {
    // Hold the listen() Promise so cleanup is race-free: if this pane unmounts
    // before the Promise resolves, awaiting it in teardown still unregisters the
    // listener. A local UnlistenFn assigned in .then() would be undefined at cleanup
    // time (and the listener would leak) when the pane is dismissed quickly.
    const unlisten = listen<{ libraryId: string; phase: string; processed: number; total: number; currentItem?: string }>('local-scan-progress', event => {
      const payload = event.payload;
      setScanProgress(current => ({ ...current, [payload.libraryId]: payload }));
    });
    return () => { unlisten.then(off => off()); };
  }, []);

  // Choose the parent location where the new library folder will be created.
  async function chooseLocation() {
    const dir = await open({ directory: true, multiple: false, title: 'Choose where to create the library' });
    if (typeof dir === 'string') setNewParent(dir);
  }

  // Create a managed library: Skald makes <parent>/<name>/ plus its staging/ and
  // _Unidentified/ subfolders. The user then drops books into staging and imports.
  async function createLibrary() {
    if (!newName.trim() || !newParent) return;
    try {
      setBusy('__new__');
      log.info('library', 'create local library', { name: newName.trim(), mediaType: newType });
      await createLocalLibrary(newName.trim(), newParent, newType);
      await st.refreshLibrary();
      void reloadUnidentified();
      setCreating(false);
      setNewName('');
      setNewParent(null);
      const msg = newType === 'podcast'
        ? `Created "${newName.trim()}" — open it and Subscribe to a podcast by RSS or OPML`
        : `Created "${newName.trim()}" — drop books into its staging folder, then Import`;
      st.setToast({ message: msg, type: 'success' });
      setNewType('book');
    } catch (e) {
      log.error('library', 'create local library failed', { err: String(e) });
      st.setToast({ message: t('localLib.createFailed'), type: 'error' });
    } finally {
      setBusy(null);
    }
  }

  // Summarize an ingest run into a single toast.
  async function rescan(lib: Library) {
    try {
      setBusy(lib.id);
      const count = await scanLocalLibrary(lib.id);
      // If the rescanned library is the active one, reload its items into the shelf.
      if (st.currentLibraryId === lib.id) await st.setActiveLibrary(lib.id);
      st.setToast({ message: t('localLib.rescanned', { name: lib.name, count }), type: 'success' });
    } catch (e) {
      log.error('library', 'rescan local library failed', { err: String(e) });
      st.setToast({ message: t('localLib.rescanFailed'), type: 'error' });
    } finally {
      setBusy(null);
    }
  }

  function removeLibrary(lib: Library) {
    st.setConfirmDialog({
      title: 'Remove local library',
      message: `Remove "${lib.name}" from Skald? This only removes it from the catalog — your files on disk are left untouched.`,
      confirmLabel: 'Remove',
      onConfirm: async () => {
        try {
          await deleteLocalLibrary(lib.id);
          await st.refreshLibrary();
          st.setToast({ message: t('localLib.removed', { name: lib.name }), type: 'info' });
        } catch (e) {
          log.error('library', 'remove local library failed', { err: String(e) });
          st.setToast({ message: t('localLib.removeFailed'), type: 'error' });
        }
      },
    });
  }

  const rootPath = (lib: Library) => lib.folders?.[0]?.fullPath ?? '';

  return (
    <div>
      {!embedded && (
        <SectionHead
          title={t('localLib.title')}
          subtitle="Build a library from audiobooks on this computer — no server required. Skald reads each book's embedded tags and chapters, sorts them into Author / Series / Title folders, and tracks playback progress locally. Use Match or Edit Metadata on a book to fill in or correct details — changes are written back to the files."
        />
      )}

      <Panel
        label={t('localLib.yourLibraries')}
        action={
          <button
            onClick={() => { setCreating(c => !c); setNewName(''); setNewParent(null); }}
            style={{
              display: 'flex', alignItems: 'center', gap: 'var(--s-2)', padding: 'var(--s-2) var(--s-3)', borderRadius: 'var(--r-md)',
              background: 'var(--onyx-accent-dim)', border: '1px solid var(--onyx-accent-edge)',
              color: 'var(--onyx-accent)', cursor: 'pointer',
              fontFamily: MONO, fontSize: 'var(--fs-0)', letterSpacing: '0.08em', textTransform: 'uppercase',
            }}
          >
            <Icon name="plus" size={12} />
            {creating ? 'Close' : 'Create library…'}
          </button>
        }
      >
        {/* Create form — Skald provisions <location>/<name>/ with staging + quarantine. */}
        {creating && (
          <div style={{ padding: 'var(--s-4) 0', borderBottom: '1px solid var(--onyx-line)', display: 'flex', flexDirection: 'column', gap: 'var(--s-3)' }}>
            <div style={{ display: 'flex', gap: 'var(--s-3)', alignItems: 'center', flexWrap: 'wrap' }}>
              <TextInput value={newName} onChange={setNewName} placeholder={newType === 'podcast' ? 'Library name (e.g. Podcasts)' : 'Library name (e.g. Audiobooks)'} />
              {/* Media type — segmented Audiobooks / Podcasts toggle. */}
              <div style={{ display: 'flex', border: '1px solid var(--onyx-glass-edge)', borderRadius: 'var(--r-sm)', overflow: 'hidden' }}>
                {(['book', 'podcast'] as const).map(t => (
                  <button
                    key={t}
                    onClick={() => setNewType(t)}
                    style={{
                      padding: 'var(--s-2) var(--s-3)', fontFamily: MONO, fontSize: 'var(--fs-0)', letterSpacing: '0.06em', textTransform: 'uppercase',
                      cursor: 'pointer', border: 'none',
                      background: newType === t ? 'var(--onyx-accent-dim)' : 'transparent',
                      color: newType === t ? 'var(--onyx-accent)' : 'var(--onyx-text-dim)',
                    }}
                  >{t === 'book' ? 'Audiobooks' : 'Podcasts'}</button>
                ))}
              </div>
              <button onClick={chooseLocation} style={btn()}>{newParent ? 'Change location' : 'Choose location…'}</button>
              <button
                onClick={createLibrary}
                disabled={!newName.trim() || !newParent || busy === '__new__'}
                style={btn(!newName.trim() || !newParent || busy === '__new__')}
              >
                {busy === '__new__' ? 'Creating…' : 'Create'}
              </button>
            </div>
            <div style={{ fontSize: 'var(--fs-2)', color: 'var(--onyx-text-mute)', fontFamily: MONO }}>
              {newParent
                ? `Will create: ${newParent.replace(/[\\/]+$/, '')}\\${newName.trim() || '<name>'}\\  (with Staging\\, Unidentified\\, Audiobooks\\, Podcasts\\)`
                : 'Pick a location; Skald creates the library folder with Staging, Unidentified, Audiobooks, and Podcasts subfolders.'}
            </div>
          </div>
        )}

        {locals.length === 0 && !creating ? (
          <div style={{ padding: 'var(--s-6) var(--s-1)', color: 'var(--onyx-text-mute)', fontSize: 'var(--fs-3)' }}>
            {t('localLib.empty')}
          </div>
        ) : (
          locals.map(lib => {
            const active = st.currentLibraryId === lib.id;
            const scanning = busy === lib.id;
            const progress = scanProgress[lib.id];
            return (
              <div
                key={lib.id}
                style={{ padding: 'var(--s-4) 0', borderBottom: '1px solid var(--onyx-line)' }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--s-4)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--s-2)', minWidth: 0, flex: 1 }}>
                    <span style={{ fontSize: 'var(--fs-4)', fontWeight: 500, color: 'var(--onyx-text)' }}>{lib.name}</span>
                    {active && (
                      <span style={{ fontFamily: MONO, fontSize: 'var(--fs-0)', letterSpacing: '0.1em', textTransform: 'uppercase', color: DIM_GOLD }}>
                        {t('localLib.active')}
                      </span>
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: 'var(--s-2)', flexShrink: 0 }}>
                    {!active && (
                      <button onClick={() => st.setActiveLibrary(lib.id)} style={btn()} title={t('localLib.switchTo')}>{t('localLib.open')}</button>
                    )}
                    {lib.mediaType !== 'podcast' && (
                      <button
                        onClick={() => setImportLibrary(lib)}
                        style={btn()}
                        title={t('localLib.addHint')}
                      >
                        {t('localLib.addBooks')}
                      </button>
                    )}
                    <button
                      onClick={() => rescan(lib)}
                      disabled={scanning}
                      style={btn(scanning)}
                      title={t('localLib.syncHint')}
                    >
                      {scanning ? 'Scanning…' : 'Rescan'}
                    </button>
                    <button
                      onClick={() => removeLibrary(lib)}
                      style={btn(false, true)}
                      title={t('localLib.removeHint')}
                    >
                      {t('localLib.remove')}
                    </button>
                  </div>
                </div>

                {scanning && progress && (
                  <div style={{ marginTop: 'var(--s-3)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 'var(--s-3)', fontFamily: MONO, fontSize: 'var(--fs-0)', color: 'var(--onyx-text-mute)' }}>
                      <span>{progress.phase === 'discovering' ? 'Discovering book folders…' : progress.phase === 'cataloguing' ? 'Updating catalog…' : `Scanning${progress.currentItem ? ` ${progress.currentItem}` : '…'}`}</span>
                      {progress.total > 0 && <span>{progress.processed} / {progress.total}</span>}
                    </div>
                    <div role="progressbar" aria-label={`Scanning ${lib.name}`} aria-valuemin={0} aria-valuemax={progress.total || undefined} aria-valuenow={progress.total ? progress.processed : undefined} style={{ height: 3, marginTop: 'var(--s-2)', overflow: 'hidden', borderRadius: 'var(--r-xs)', background: 'rgba(255,255,255,0.08)' }}>
                      <div style={{ height: '100%', width: progress.total ? `${Math.min(100, progress.processed / progress.total * 100)}%` : '35%', background: 'var(--onyx-accent)', transition: 'width 0.15s' }} />
                    </div>
                  </div>
                )}

                {/* Folder paths — aligned glass buttons that open the location.
                    Staging is auto-organized by the app-wide watcher on drop. */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-2)', marginTop: 'var(--s-3)' }}>
                  <PathChip label={t('localLib.folder')} path={rootPath(lib)} />
                  {lib.stagingPath && (
                    <PathChip label={t('localLib.staging')} hint={t('localLib.stagingHint')} path={lib.stagingPath} />
                  )}
                </div>
              </div>
            );
          })
        )}
      </Panel>

      {/* Needs attention — quarantined books awaiting a metadata match. */}
      {locals.some(l => (unidentified[l.id]?.length ?? 0) > 0) && (
        <Panel label={t('localLib.needsAttention')}>
          {locals.flatMap(lib =>
            (unidentified[lib.id] ?? []).map(item => (
              <div
                key={item.sourcePath}
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--s-4)', padding: 'var(--s-3) 0', borderBottom: '1px solid var(--onyx-line)' }}
              >
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontSize: 'var(--fs-3)', color: 'var(--onyx-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {item.sourcePath.split(/[\\/]/).filter(Boolean).pop()}
                  </div>
                  <div style={{ marginTop: 'var(--s-1)', fontSize: 'var(--fs-0)', color: 'var(--onyx-text-mute)', fontFamily: MONO }}>{lib.name} · unidentified</div>
                </div>
                <button onClick={() => setMatchTarget({ libId: lib.id, item })} style={btn()}>{t('localLib.match')}</button>
              </div>
            )),
          )}
        </Panel>
      )}

      {matchTarget && (
        <MatchModal
          item={matchTarget.item.item}
          adapter={makeLocalQuarantineAdapter(matchTarget.libId, matchTarget.item)}
          onClose={() => setMatchTarget(null)}
          onComplete={async () => {
            // Filed out of quarantine into the shelf — refresh the active library
            // (if it's the one we matched in) and the "Needs attention" queue.
            if (st.currentLibraryId === matchTarget.libId) await st.setActiveLibrary(matchTarget.libId);
            void reloadUnidentified();
            setMatchTarget(null);
          }}
          onRefresh={() => {}}
        />
      )}

      {importLibrary && (
        <LocalImportDialog
          st={st}
          library={importLibrary}
          onClose={() => setImportLibrary(null)}
          onImported={() => void reloadUnidentified()}
        />
      )}
    </div>
  );
}

// Small mono action button used in the library rows.
function btn(disabled = false, danger = false): React.CSSProperties {
  return {
    padding: 'var(--s-2) var(--s-3)', borderRadius: 'var(--r-sm)', fontFamily: MONO, fontSize: 'var(--fs-0)',
    letterSpacing: '0.06em', textTransform: 'uppercase', whiteSpace: 'nowrap',
    cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.55 : 1,
    background: 'transparent',
    border: `1px solid ${danger ? 'rgba(220,90,90,0.35)' : 'var(--onyx-glass-edge)'}`,
    color: danger ? 'rgba(230,120,120,0.9)' : 'var(--onyx-text-dim)',
  };
}
