// Upload modal (Server Upload roadmap, Phase 3) — parity with the ABS web
// client's Upload page. Pick audio files (or a folder's direct files), fill in
// Title/Author/Series, and POST /api/upload streams them to the server, which
// files them under folder/author/series/title and lets its library watcher
// scan the new item in (Skald's library-item-added socket listener then adds
// it to the shelf without a manual refresh).
import { useState, useRef, useEffect } from 'react';
import { useI18n } from '../i18n';
import type { CSSProperties } from 'react';
import ReactDOM from 'react-dom';
import { open } from '@tauri-apps/plugin-dialog';
import { listen } from '@tauri-apps/api/event';
import type { OnyxState } from '../state/onyx';
import { resolveUploadFiles, uploadMedia, cancelUpload } from '../api/abs';
import type { UploadFileEntry } from '../api/abs';
import { useModalFocus } from '../hooks/useModalFocus';
import { log } from '../lib/log';
import Icon from './Icon';

// One family for interface text; monospace is opt-in via .ui-tech.
const UI_STACK = 'var(--font-ui)';

const MONO = UI_STACK;
const SERIF = UI_STACK;
// Extensions offered by the file picker: the playable audio set (matches the
// local scanner / resolve_upload_files) plus cover-art and reader extras that
// ABS stores alongside the audio.
const UPLOAD_EXTS = [
  'm4b', 'm4a', 'mp3', 'flac', 'ogg', 'opus', 'aac', 'wav',
  'jpg', 'jpeg', 'png', 'webp', 'pdf', 'epub',
];

// Mirrors the Rust serde_json payload for "upload-progress".
interface UploadProgressPayload {
  uploadId: string;
  title: string;
  bytesSent: number;
  totalBytes: number;
}

// Format a byte count as a human-readable string (same scale as the downloads toast).
function fmtBytes(n: number): string {
  if (n === 0) return '0 B';
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  return `${(n / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

const fieldStyle: CSSProperties = {
  width: '100%', boxSizing: 'border-box', padding: 'var(--s-3) var(--s-3)',
  background: 'var(--onyx-bg-deep)', border: '1px solid var(--onyx-glass-edge)',
  borderRadius: 'var(--r-md)', color: 'var(--onyx-text)', fontFamily: 'inherit', fontSize: 'var(--fs-3)',
  outline: 'none', transition: 'border-color 0.15s',
};

const labelStyle: CSSProperties = {
  fontFamily: MONO, fontSize: 'var(--fs-0)', letterSpacing: '0.12em', textTransform: 'uppercase',
  color: 'var(--onyx-text-mute)', marginBottom: 'var(--s-1)', display: 'block',
};

const pickerBtn: CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 'var(--s-2)', padding: 'var(--s-2) var(--s-4)',
  background: 'transparent', border: '1px dashed var(--onyx-accent-edge)',
  borderRadius: 'var(--r-md)', color: 'var(--onyx-accent)', cursor: 'pointer',
  fontFamily: MONO, fontSize: 'var(--fs-0)', letterSpacing: '0.08em', textTransform: 'uppercase',
};

export interface UploadModalProps {
  st: OnyxState;
  onClose: () => void;
}

export default function UploadModal({ st, onClose }: UploadModalProps) {
  const { t } = useI18n();
  const lib = st.activeLibrary;
  const isPodcast = lib?.mediaType === 'podcast';
  // Folders with a server-assigned id are the only valid upload destinations.
  const folders = (lib?.folders ?? []).filter(f => f.id);

  const [files, setFiles] = useState<UploadFileEntry[]>([]);
  const [title, setTitle] = useState('');
  const [author, setAuthor] = useState('');
  const [series, setSeries] = useState('');
  const [folderId, setFolderId] = useState<string>(folders[0]?.id ?? '');
  // Non-null while an upload is in flight — drives the in-modal progress bar
  // and locks the form (fields, pickers, close-on-backdrop).
  const [progress, setProgress] = useState<{ bytesSent: number; totalBytes: number } | null>(null);
  const [error, setError] = useState('');
  // The in-flight upload's client-generated id; progress events are filtered
  // against it so a stray event from a past upload can't drive this bar.
  const uploadIdRef = useRef<string | null>(null);

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    listen<UploadProgressPayload>('upload-progress', e => {
      if (e.payload.uploadId !== uploadIdRef.current) return;
      setProgress({ bytesSent: e.payload.bytesSent, totalBytes: e.payload.totalBytes });
    }).then(fn => { unlisten = fn; });
    return () => { unlisten?.(); };
  }, []);

  // Merge newly picked entries, deduping by absolute path so re-picking the
  // same file (or folder) doesn't double it up.
  function mergeFiles(picked: UploadFileEntry[]) {
    setFiles(prev => {
      const seen = new Set(prev.map(f => f.path));
      return [...prev, ...picked.filter(f => !seen.has(f.path))];
    });
  }

  async function pickFiles() {
    const picked = await open({
      multiple: true,
      title: 'Choose files to upload',
      filters: [{ name: 'Audiobook files', extensions: UPLOAD_EXTS }],
    });
    const paths = Array.isArray(picked) ? picked : (typeof picked === 'string' ? [picked] : []);
    if (paths.length === 0) return; // cancelled
    try {
      mergeFiles(await resolveUploadFiles(paths));
      setError('');
    } catch (e) {
      setError(String(e));
    }
  }

  async function pickFolder() {
    const picked = await open({ directory: true, multiple: false, title: 'Choose a folder to upload' });
    if (typeof picked !== 'string') return; // cancelled
    try {
      const resolved = await resolveUploadFiles([picked]);
      if (resolved.length === 0) {
        setError('No uploadable files found directly in that folder.');
        return;
      }
      mergeFiles(resolved);
      setError('');
      // Prefill the (required) title from the folder name — the most common
      // case is picking a folder already named after the book.
      if (!title.trim()) {
        const base = picked.split(/[\\/]/).filter(Boolean).pop();
        if (base) setTitle(base);
      }
    } catch (e) {
      setError(String(e));
    }
  }

  const totalBytes = files.reduce((a, f) => a + f.size, 0);

  // The server flattens EVERY uploaded file into one destination directory named
  // by its (sanitized) basename — and still answers 200 when a move collides —
  // so two picks like "Disc 1/01.mp3" + "Disc 2/01.mp3" would silently drop or
  // overwrite one file. Detect basename collisions (case-insensitive, matching
  // Windows/ABS filing semantics) and block the upload until they're resolved.
  const dupNames = (() => {
    const seen = new Set<string>();
    const dups = new Set<string>();
    for (const f of files) {
      const key = f.name.toLowerCase();
      if (seen.has(key)) dups.add(f.name);
      seen.add(key);
    }
    return [...dups];
  })();

  const canStart = files.length > 0 && dupNames.length === 0 && title.trim().length > 0 && folderId !== '' && progress === null;

  async function startUpload() {
    if (!canStart || !lib) return;
    const id = crypto.randomUUID();
    uploadIdRef.current = id;
    setError('');
    setProgress({ bytesSent: 0, totalBytes });
    log.info('library', 'upload start', { lib: lib.id, folder: folderId, files: files.length, bytes: totalBytes });
    try {
      await uploadMedia(
        st.serverUrl, id, lib.id, folderId, title.trim(),
        // The server ignores author/series for podcast libraries; send empties.
        isPodcast ? '' : author.trim(), isPodcast ? '' : series.trim(),
        files.map(f => f.path),
      );
      log.info('library', 'upload complete', { lib: lib.id, title: title.trim() });
      st.setToast({
        message: 'Uploaded — the server is scanning it in. It can take a moment (or a library scan if the folder watcher is off).',
        type: 'success',
      });
      // With live sync on, the watcher's item_added socket event appends the new
      // item to the shelf. Without it there is no automatic path, so schedule a
      // one-shot refresh — by 10 s the server has typically watched + scanned the
      // folder in (files are already moved when POST /api/upload returns). The
      // timer outliving this modal is intentional.
      if (localStorage.getItem('onyx.sync.live') !== 'true') {
        const refresh = st.refreshLibrary;
        setTimeout(() => { void refresh().catch(e => log.error('library', 'post-upload refresh failed', { err: String(e) })); }, 10_000);
      }
      onClose();
    } catch (e) {
      const msg = String(e);
      uploadIdRef.current = null;
      setProgress(null);
      if (msg === 'cancelled') {
        st.setToast({ message: t('toastMsg.uploadCancelled'), type: 'info' });
      } else {
        log.error('library', 'upload failed', { lib: lib.id, err: msg });
        setError(msg);
      }
    }
  }

  const uploading = progress !== null;
  const dialogRef = useModalFocus<HTMLDivElement>(onClose, !uploading);
  if (!lib) return null;
  const pct = uploading && progress.totalBytes > 0
    ? Math.min(100, (progress.bytesSent / progress.totalBytes) * 100)
    : 0;

  const modal = (
    <div
      className="ui-scrim"  style={{ zIndex: 2000 }}
      // Backdrop click closes only while idle — never abandon an active upload silently.
      onMouseDown={e => { if (e.target === e.currentTarget && !uploading) onClose(); }}
    >
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="upload-dialog-title" style={{
        width: 460, maxHeight: '80vh',
        background: 'var(--surface-overlay)', border: '1px solid var(--onyx-glass-edge)',
        borderRadius: 'var(--r-overlay)',
        boxShadow: 'var(--shadow-dialog)',
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
      }}>
        {/* Header */}
        <div style={{ flexShrink: 0, padding: 'var(--s-5) var(--s-5) 0 var(--s-6)', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 'var(--s-4)' }}>
          <div style={{ minWidth: 0 }}>
            <div id="upload-dialog-title" style={{ fontFamily: SERIF, fontSize: 19, fontWeight: 500, letterSpacing: '-0.015em', lineHeight: 1.1 }}>
              Upload to {lib.name}
            </div>
            <div style={{ fontFamily: MONO, fontSize: 'var(--fs-0)', color: 'var(--onyx-text-mute)', letterSpacing: '0.06em', marginTop: 'var(--s-2)' }}>
              {isPodcast ? 'New podcast — files go to the server' : 'New book — files go to the server'}
            </div>
          </div>
          <button
            aria-label={t('upload.close')}
            onClick={() => { if (!uploading) onClose(); }}
            disabled={uploading}
            style={{ width: 28, height: 28, borderRadius: 'var(--r-sm)', background: 'none', border: '1px solid transparent', color: 'var(--onyx-text-mute)', cursor: uploading ? 'default' : 'pointer', opacity: uploading ? 0.4 : 1, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 'var(--fs-4)', lineHeight: 1, flexShrink: 0, marginTop: '2px' }}
          >✕</button>
        </div>
        <div style={{ flexShrink: 0, height: 1, background: 'var(--onyx-line)', margin: 'var(--s-4) 0 0' }} />

        {/* Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: 'var(--s-4) var(--s-6)', display: 'flex', flexDirection: 'column', gap: 'var(--s-4)' }}>
          {/* Pickers */}
          <div style={{ display: 'flex', gap: 'var(--s-2)' }}>
            <button onClick={() => void pickFiles()} disabled={uploading} style={{ ...pickerBtn, opacity: uploading ? 0.4 : 1, cursor: uploading ? 'default' : 'pointer' }}>
              <Icon name="plus" size={12} /> {t('upload.addFiles')}
            </button>
            <button onClick={() => void pickFolder()} disabled={uploading} style={{ ...pickerBtn, opacity: uploading ? 0.4 : 1, cursor: uploading ? 'default' : 'pointer' }}>
              <Icon name="plus" size={12} /> {t('upload.addFolder')}
            </button>
          </div>

          {/* File list */}
          {files.length > 0 && (
            <div style={{ border: '1px solid var(--onyx-line)', borderRadius: 'var(--r-md)', overflow: 'hidden' }}>
              <div style={{ maxHeight: 168, overflowY: 'auto' }}>
                {files.map(f => (
                  <div key={f.path} style={{ display: 'flex', alignItems: 'center', gap: 'var(--s-3)', padding: 'var(--s-2) var(--s-3)', borderBottom: '1px solid var(--onyx-line)' }}>
                    <Icon name="file" size={13} color="var(--onyx-text-mute)" />
                    <span title={f.path} style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 'var(--fs-2)' }}>{f.name}</span>
                    <span style={{ fontFamily: MONO, fontSize: 'var(--fs-0)', color: 'var(--onyx-text-mute)', flexShrink: 0 }}>{fmtBytes(f.size)}</span>
                    {!uploading && (
                      <button
                        onClick={() => setFiles(prev => prev.filter(x => x.path !== f.path))}
                        title={t('upload.remove')}
                        style={{ flexShrink: 0, width: 18, height: 18, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'transparent', border: 'none', color: 'var(--onyx-text-mute)', fontSize: 'var(--fs-1)', cursor: 'pointer', padding: '0', lineHeight: 1 }}
                      >✕</button>
                    )}
                  </div>
                ))}
              </div>
              <div style={{ padding: 'var(--s-2) var(--s-3)', fontFamily: MONO, fontSize: 'var(--fs-0)', color: 'var(--onyx-text-mute)', letterSpacing: '0.04em' }}>
                {files.length} file{files.length > 1 ? 's' : ''} · {fmtBytes(totalBytes)}
              </div>
            </div>
          )}

          {/* Fields — Title always; Author/Series for book libraries only (the
              server ignores them for podcasts, whose dir is just folder/title). */}
          <div>
            <label style={labelStyle}>Title *</label>
            <input
              type="text" value={title} onChange={e => setTitle(e.target.value)} disabled={uploading}
              placeholder={isPodcast ? 'Podcast title…' : 'Book title…'}
              onFocus={e => { e.currentTarget.style.borderColor = 'var(--onyx-accent-edge)'; }}
              onBlur={e => { e.currentTarget.style.borderColor = 'var(--onyx-glass-edge)'; }}
              style={fieldStyle}
            />
          </div>
          {!isPodcast && (
            <div style={{ display: 'flex', gap: 'var(--s-3)' }}>
              <div style={{ flex: 1 }}>
                <label style={labelStyle}>{t('upload.author')}</label>
                <input
                  type="text" value={author} onChange={e => setAuthor(e.target.value)} disabled={uploading}
                  placeholder={t('upload.authorPlaceholder')}
                  onFocus={e => { e.currentTarget.style.borderColor = 'var(--onyx-accent-edge)'; }}
                  onBlur={e => { e.currentTarget.style.borderColor = 'var(--onyx-glass-edge)'; }}
                  style={fieldStyle}
                />
              </div>
              <div style={{ flex: 1 }}>
                <label style={labelStyle}>{t('upload.series')}</label>
                <input
                  type="text" value={series} onChange={e => setSeries(e.target.value)} disabled={uploading}
                  placeholder={t('upload.seriesPlaceholder')}
                  onFocus={e => { e.currentTarget.style.borderColor = 'var(--onyx-accent-edge)'; }}
                  onBlur={e => { e.currentTarget.style.borderColor = 'var(--onyx-glass-edge)'; }}
                  style={fieldStyle}
                />
              </div>
            </div>
          )}

          {/* Destination folder — auto-selected and hidden when the library has
              exactly one; radio-style rows when there is a real choice. */}
          {folders.length > 1 && (
            <div>
              <label style={labelStyle}>{t('upload.serverFolder')}</label>
              <div style={{ border: '1px solid var(--onyx-line)', borderRadius: 'var(--r-md)', overflow: 'hidden' }}>
                {folders.map(f => {
                  const active = f.id === folderId;
                  return (
                    <button
                      key={f.id}
                      onClick={() => { if (!uploading) setFolderId(f.id!); }}
                      disabled={uploading}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 'var(--s-3)', width: '100%', padding: 'var(--s-2) var(--s-3)',
                        background: active ? 'var(--onyx-accent-dim)' : 'transparent',
                        border: 'none', borderLeft: `2px solid ${active ? 'var(--onyx-accent)' : 'transparent'}`,
                        color: active ? 'var(--onyx-accent)' : 'var(--onyx-text)',
                        fontSize: 'var(--fs-2)', textAlign: 'left', fontFamily: MONO,
                        cursor: uploading ? 'default' : 'pointer',
                      }}
                    >
                      <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.fullPath}</span>
                      {active && <Icon name="check" size={12} />}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
          {folders.length === 0 && (
            <div style={{ fontSize: 'var(--fs-2)', color: '#e8716a', fontFamily: MONO }}>
              {t('upload.noFolders')}
            </div>
          )}

          {dupNames.length > 0 && (
            <div style={{ fontSize: 'var(--fs-2)', color: '#e8716a', fontFamily: MONO, wordBreak: 'break-word' }}>
              Duplicate file name{dupNames.length > 1 ? 's' : ''}: {dupNames.join(', ')} — the server puts all
              files in one folder, so one copy would be lost. Remove or rename the duplicates.
            </div>
          )}

          {error && (
            <div style={{ fontSize: 'var(--fs-2)', color: '#e8716a', fontFamily: MONO, wordBreak: 'break-word' }}>{error}</div>
          )}
        </div>

        {/* Footer — progress bar while uploading, action buttons while idle. */}
        <div style={{ flexShrink: 0, padding: 'var(--s-3) var(--s-4) var(--s-4)', borderTop: '1px solid var(--onyx-line)' }}>
          {uploading ? (
            <div>
              <div style={{ height: 4, borderRadius: 'var(--r-xs)', background: 'var(--onyx-glass-edge)', overflow: 'hidden', marginBottom: 'var(--s-2)' }}>
                <div style={{ height: '100%', width: `${pct}%`, background: 'var(--onyx-accent)', borderRadius: 'var(--r-xs)', transition: 'width 0.2s ease' }} />
              </div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--s-3)' }}>
                <span style={{ fontFamily: MONO, fontSize: 'var(--fs-0)', color: 'var(--onyx-text-mute)' }}>
                  {fmtBytes(progress.bytesSent)} / {fmtBytes(progress.totalBytes)}
                </span>
                <button
                  onClick={() => { if (uploadIdRef.current) void cancelUpload(uploadIdRef.current).catch(e => log.error('library', 'cancelUpload failed', { err: String(e) })); }}
                  style={{ fontFamily: MONO, fontSize: 'var(--fs-0)', letterSpacing: '0.1em', textTransform: 'uppercase', padding: 'var(--s-2) var(--s-3)', borderRadius: 'var(--r-md)', cursor: 'pointer', background: 'transparent', border: '1px solid var(--onyx-glass-edge)', color: 'var(--onyx-text-dim)' }}
                >{t('upload.cancel')}</button>
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', gap: 'var(--s-2)' }}>
              <button
                onClick={onClose}
                style={{ flex: 1, fontFamily: MONO, fontSize: 'var(--fs-0)', letterSpacing: '0.1em', textTransform: 'uppercase', padding: 'var(--s-3) var(--s-4)', borderRadius: 'var(--r-md)', cursor: 'pointer', background: 'transparent', border: '1px solid var(--onyx-glass-edge)', color: 'var(--onyx-text-dim)' }}
              >{t('upload.cancel')}</button>
              <button
                onClick={() => void startUpload()}
                disabled={!canStart}
                style={{
                  flex: 2, fontFamily: MONO, fontSize: 'var(--fs-0)', letterSpacing: '0.1em', textTransform: 'uppercase',
                  padding: 'var(--s-3) var(--s-4)', borderRadius: 'var(--r-md)', fontWeight: 600, border: '1px solid transparent',
                  background: canStart ? 'var(--onyx-accent)' : 'var(--onyx-accent-dim)',
                  color: canStart ? 'var(--onyx-bg)' : 'var(--onyx-text-mute)',
                  cursor: canStart ? 'pointer' : 'default',
                }}
              >
                {files.length > 0 ? `Upload ${files.length} file${files.length > 1 ? 's' : ''}` : 'Upload'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );

  return ReactDOM.createPortal(modal, document.body);
}
