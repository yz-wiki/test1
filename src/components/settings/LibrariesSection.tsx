// LibrariesSection — admin-only UI for managing Audiobookshelf libraries.
// Lets admin users create, edit, delete, and scan libraries without opening
// the ABS web interface. Hidden entirely for non-admin accounts (Phase 7
// adds the nav-level guard; this component returns null as a safety net).

import { useState, useEffect, useRef } from 'react';
import { useI18n } from '../../i18n';
import { SectionHead, MONO, SERIF, Panel } from './shared';
import type { OnyxState } from '../../state/onyx';
import {
  getLibrariesFull,
  createLibrary as apiCreateLibrary,
  updateLibrary as apiUpdateLibrary,
  deleteLibrary as apiDeleteLibrary,
  scanLibrary as apiScanLibrary,
  getCustomMetadataProviders,
  createCustomMetadataProvider,
  deleteCustomMetadataProvider,
} from '../../api/abs';
import type { Library, UpdateLibraryPayload, CustomMetadataProvider } from '../../api/abs';
// Form model, widgets, picker, form, and provider panels split out per the
// God-File Decomposition roadmap (review L3/L7) — pure moves, same behavior.
import { relativeTime, iconEmoji, DEFAULT_FORM, libraryToForm, formToSettings, type FormState } from './libraries/formModel';
import { SmallBtn } from './libraries/widgets';
import LibraryForm from './libraries/LibraryForm';
import { CustomProvidersManager, OpenLibraryManager } from './libraries/providers';


export interface LibrariesSectionProps {
  st: OnyxState;
  // Hides the SectionHead so the section can be hosted inside another pane
  // (LibraryManagementSection's combined "Libraries" view).
  embedded?: boolean;
}

export default function LibrariesSection({ st, embedded = false }: LibrariesSectionProps) {
  const { t } = useI18n();
  const isAdmin = st.isAdmin;

  const [libraries, setLibraries] = useState<Library[]>([]);
  const [customProviders, setCustomProviders] = useState<CustomMetadataProvider[]>([]);
  const [loading, setLoading] = useState(false);
  const [listError, setListError] = useState('');
  const [editTarget, setEditTarget] = useState<string | null>(null);   // library id
  const [createMode, setCreateMode] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Library | null>(null);
  const [deletePending, setDeletePending] = useState(false);
  const [scanPending, setScanPending] = useState<Set<string>>(new Set());
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (st.serverUrl) void load();
    return () => { if (toastTimer.current) clearTimeout(toastTimer.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!isAdmin) return null;

  function showToast(msg: string) {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2500);
  }

  async function load() {
    setLoading(true);
    setListError('');
    try {
      setLibraries(await getLibrariesFull(st.serverUrl));
      // Custom providers are best-effort — older ABS versions lack the endpoint.
      getCustomMetadataProviders(st.serverUrl).then(setCustomProviders).catch(() => setCustomProviders([]));
    } catch (e) {
      setListError(typeof e === 'string' ? e : (e as Error)?.message ?? 'Failed to load libraries.');
    } finally {
      setLoading(false);
    }
  }

  async function handleScan(lib: Library) {
    setScanPending(prev => new Set([...prev, lib.id]));
    try {
      await apiScanLibrary(st.serverUrl, lib.id, false);
      showToast(`Scan started for "${lib.name}"`);
    } catch (e) {
      showToast(`Scan failed: ${typeof e === 'string' ? e : (e as Error)?.message ?? 'error'}`);
    } finally {
      setScanPending(prev => { const s = new Set(prev); s.delete(lib.id); return s; });
    }
  }

  async function handleCreate(form: FormState) {
    const folders = form.folders.filter(p => p.trim()).map(p => ({ fullPath: p.trim() }));
    const lib = await apiCreateLibrary(
      st.serverUrl, form.name.trim(), form.mediaType,
      folders, form.icon, form.provider, formToSettings(form),
    );
    setLibraries(prev => [...prev, lib]);
    setCreateMode(false);
    showToast(`Library "${lib.name}" created`);
    // Refresh global state so the shelf switcher picks up the new library.
    void st.refreshLibrary();
  }

  async function handleEdit(lib: Library, form: FormState) {
    const folders = form.folders.filter(p => p.trim()).map(p => ({ fullPath: p.trim() }));
    const payload: UpdateLibraryPayload = {
      name: form.name.trim(),
      icon: form.icon,
      provider: form.provider,
      folders,
      settings: formToSettings(form),
    };
    const updated = await apiUpdateLibrary(st.serverUrl, lib.id, payload);
    setLibraries(prev => prev.map(l => (l.id === updated.id ? updated : l)));
    setEditTarget(null);
    showToast(`"${updated.name}" updated`);
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeletePending(true);
    try {
      await apiDeleteLibrary(st.serverUrl, deleteTarget.id);
      setLibraries(prev => prev.filter(l => l.id !== deleteTarget.id));
      setDeleteTarget(null);
      showToast('Library deleted');
      // Refresh global state so the shelf switcher removes the deleted library
      // and currentLibraryId is repointed if it was the active one.
      void st.refreshLibrary();
    } catch (e) {
      setListError(typeof e === 'string' ? e : (e as Error)?.message ?? 'Delete failed.');
      setDeleteTarget(null);
    } finally {
      setDeletePending(false);
    }
  }

  async function handleAddProvider(p: { name: string; url: string; mediaType: string; authHeaderValue?: string }) {
    const created = await createCustomMetadataProvider(st.serverUrl, p);
    setCustomProviders(prev => [...prev, created]);
    showToast(`Provider "${created.name}" added`);
  }

  async function handleDeleteProvider(id: string) {
    await deleteCustomMetadataProvider(st.serverUrl, id);
    setCustomProviders(prev => prev.filter(p => p.id !== id));
    showToast('Provider removed');
  }

  return (
    <div>
      {!embedded && (
        <SectionHead
          title={t('libs.title')}
          subtitle="Manage libraries on your Audiobookshelf server."
        />
      )}

      <Panel
        label={t('libs.title')}
        action={!createMode ? (
          <SmallBtn onClick={() => { setCreateMode(true); setEditTarget(null); setDeleteTarget(null); }}>
            + New Library
          </SmallBtn>
        ) : undefined}
      >
      {/* Create form */}
      {createMode && (
        <div style={{
          margin: 'var(--s-2) var(--s-1) var(--s-4)',
          border: '1px solid var(--onyx-accent-edge)',
          borderRadius: 'var(--r-md)',
          overflow: 'hidden',
        }}>
          <div style={{
            padding: 'var(--s-3) var(--s-5) 0',
            fontFamily: SERIF, fontSize: 'var(--fs-4)', fontWeight: 500,
            color: 'var(--onyx-text-dim)',
          }}>
            {t('libs.newLibrary')}
          </div>
          <LibraryForm
            initial={DEFAULT_FORM}
            lockMediaType={false}
            onSubmit={handleCreate}
            onCancel={() => setCreateMode(false)}
            submitLabel="Create Library"
            serverUrl={st.serverUrl}
            customProviders={customProviders}
          />
        </div>
      )}

      {/* Loading / error */}
      {loading && (
        <div style={{ fontFamily: MONO, fontSize: 'var(--fs-1)', color: 'var(--onyx-text-mute)', letterSpacing: '0.06em', padding: 'var(--s-3) 0' }}>
          Loading libraries…
        </div>
      )}
      {!loading && listError && (
        <div style={{ fontFamily: MONO, fontSize: 'var(--fs-1)', color: '#e8716a', padding: 'var(--s-2) 0' }}>
          {listError}
        </div>
      )}

      {/* Library list */}
      {!loading && !listError && (
        <div>
          {libraries.length === 0 && !createMode && (
            <div style={{ fontFamily: MONO, fontSize: 'var(--fs-1)', color: 'var(--onyx-text-mute)', letterSpacing: '0.06em', padding: 'var(--s-3) 0' }}>
              {t('libs.empty')}
            </div>
          )}

          {libraries.map((lib, idx) => {
            const isEditing = editTarget === lib.id;
            const isDeleting = deleteTarget?.id === lib.id;
            const isScanning = scanPending.has(lib.id);

            return (
              <div key={lib.id} style={{ borderBottom: idx < libraries.length - 1 && !isEditing ? '1px solid var(--onyx-line)' : 'none' }}>
                {/* Library row */}
                <div style={{ padding: 'var(--s-4) var(--s-1)' }}>
                  {/* Top row: icon · name+meta · action buttons */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--s-3)' }}>
                    <span style={{ fontSize: 'var(--fs-6)', flexShrink: 0, lineHeight: 1 }}>
                      {iconEmoji(lib.icon)}
                    </span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{
                        fontSize: 'var(--fs-4)', fontWeight: 500, color: 'var(--onyx-text)',
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      }}>
                        {lib.name}
                      </div>
                      <div style={{ fontFamily: MONO, fontSize: 'var(--fs-0)', color: 'var(--onyx-text-mute)', marginTop: 'var(--s-1)', letterSpacing: '0.04em' }}>
                        {lib.mediaType}{lib.provider ? ` · ${lib.provider}` : ''}
                      </div>
                    </div>

                    {!isDeleting && (
                      <div style={{ display: 'flex', gap: 'var(--s-2)', flexShrink: 0, alignItems: 'center' }}>
                        <SmallBtn
                          muted
                          onClick={() => handleScan(lib)}
                          disabled={isScanning}
                          title={t('libs.scan')}
                        >
                          {isScanning ? 'Scanning…' : 'Scan'}
                        </SmallBtn>
                        <SmallBtn
                          muted
                          onClick={() => {
                            setEditTarget(isEditing ? null : lib.id);
                            setCreateMode(false);
                            setDeleteTarget(null);
                          }}
                        >
                          {isEditing ? 'Collapse' : 'Edit'}
                        </SmallBtn>
                        <SmallBtn
                          danger
                          onClick={() => {
                            setDeleteTarget(lib);
                            setEditTarget(null);
                            setCreateMode(false);
                          }}
                        >
                          {t('libs.delete')}
                        </SmallBtn>
                      </div>
                    )}
                  </div>

                  {/* Folder paths */}
                  {lib.folders.length > 0 && (
                    <div style={{ marginTop: 'var(--s-2)', display: 'flex', flexWrap: 'wrap', gap: '2px 14px' }}>
                      {lib.folders.map((f, i) => (
                        <span key={i} style={{ fontFamily: MONO, fontSize: 'var(--fs-0)', color: 'var(--onyx-text-mute)', letterSpacing: '0.02em' }}>
                          {f.fullPath}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Last scan */}
                  <div style={{ marginTop: 'var(--s-1)', fontFamily: MONO, fontSize: 'var(--fs-0)', color: 'var(--onyx-text-mute)', opacity: 0.65 }}>
                    Last scanned {relativeTime(lib.lastScan)}
                  </div>

                  {/* Delete confirmation — inline warning, no modal */}
                  {isDeleting && (
                    <div style={{
                      marginTop: 'var(--s-4)', padding: 'var(--s-4) var(--s-4)',
                      background: 'rgba(232,113,106,0.07)',
                      border: '1px solid rgba(232,113,106,0.22)',
                      borderRadius: 'var(--r-sm)',
                    }}>
                      <div style={{ fontSize: 'var(--fs-2)', color: 'var(--onyx-text)', lineHeight: 1.55, marginBottom: 'var(--s-4)' }}>
                        <span style={{ color: '#e8716a', fontWeight: 600 }}>⚠ Deleting "{lib.name}"</span>{' '}
                        will permanently remove all library items, collections, and listening progress from the server.
                        Files on disk are <strong>not</strong> deleted. This cannot be undone.
                      </div>
                      <div style={{ display: 'flex', gap: 'var(--s-2)', justifyContent: 'flex-end' }}>
                        <SmallBtn muted onClick={() => setDeleteTarget(null)}>{t('libs.cancel')}</SmallBtn>
                        <SmallBtn danger onClick={handleDelete} disabled={deletePending}>
                          {deletePending ? 'Deleting…' : 'Delete Library'}
                        </SmallBtn>
                      </div>
                    </div>
                  )}
                </div>

                {/* Inline edit form — expands below the row */}
                {isEditing && (
                  <div style={{
                    margin: '0 var(--s-1) var(--s-4)',
                    border: '1px solid var(--onyx-accent-edge)',
                    borderRadius: 'var(--r-md)',
                    overflow: 'hidden',
                  }}>
                    <LibraryForm
                      initial={libraryToForm(lib)}
                      lockMediaType
                      onSubmit={form => handleEdit(lib, form)}
                      onCancel={() => setEditTarget(null)}
                      submitLabel="Save Changes"
                      serverUrl={st.serverUrl}
                      customProviders={customProviders}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
      </Panel>

      {/* Custom metadata providers */}
      {!loading && !listError && (
        <CustomProvidersManager
          providers={customProviders}
          onAdd={handleAddProvider}
          // Confirm before deleting — provider config (URL + auth header) is
          // not recoverable and nearby destructive actions all confirm.
          onDelete={async id => {
            const p = customProviders.find(x => x.id === id);
            st.setConfirmDialog({
              title: 'Delete metadata provider',
              message: `Delete the custom provider "${p?.name ?? id}"? Its configuration cannot be recovered.`,
              confirmLabel: 'Delete',
              onConfirm: () => void handleDeleteProvider(id),
            });
          }}
        />
      )}

      {/* Open Library integration (moved from the former Integrations tab) */}
      <OpenLibraryManager st={st} />

      {/* Toast */}
      {toast && (
        <div style={{
          position: 'fixed', bottom: 28, right: 32,
          padding: 'var(--s-3) var(--s-5)',
          background: 'var(--surface-overlay)',
          border: '1px solid var(--onyx-glass-edge)',
          borderRadius: 'var(--r-md)',
          fontFamily: MONO, fontSize: 'var(--fs-1)', color: 'var(--onyx-text)',
          letterSpacing: '0.04em',
          boxShadow: 'var(--shadow-popover)',
          zIndex: 1000,
        }}>
          {toast}
        </div>
      )}
    </div>
  );
}
