// Upload modal (Server Upload roadmap, Phase 3) — parity with the ABS web
// client's Upload page. Pick audio files (or a folder's direct files), fill in
// Title/Author/Series, and POST /api/upload streams them to the server, which
// files them under folder/author/series/title and lets its library watcher
// scan the new item in (Skald's library-item-added socket listener then adds
// it to the shelf without a manual refresh).
import { useState, useRef, useEffect } from 'react';
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

const MONO = "'JetBrains Mono', ui-monospace, monospace";
const SERIF = '"Source Serif 4", "Iowan Old Style", Georgia, serif';

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
  width: '100%', boxSizing: 'border-box', padding: '9px 12px',
  background: 'rgba(0,0,0,0.3)', border: '1px solid var(--onyx-glass-edge)',
  borderRadius: 8, color: 'var(--onyx-text)', fontFamily: 'inherit', fontSize: 13,
  outline: 'none', transition: 'border-color 0.15s',
};

const labelStyle: CSSProperties = {
  fontFamily: MONO, fontSize: 9, letterSpacing: '0.12em', textTransform: 'uppercase',
  color: 'var(--onyx-text-mute)', marginBottom: 5, display: 'block',
};

const pickerBtn: CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 7, padding: '8px 13px',
  background: 'transparent', border: '1px dashed var(--onyx-accent-edge)',
  borderRadius: 8, color: 'var(--onyx-accent)', cursor: 'pointer',
  fontFamily: MONO, fontSize: 10, letterSpacing: '0.08em', textTransform: 'uppercase',
};

export interface UploadModalProps {
  st: OnyxState;
  onClose: () => void;
}

export default function UploadModal({ st, onClose }: UploadModalProps) {
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
      title: '选择要上传的文件',
      filters: [{ name: '有声书文件', extensions: UPLOAD_EXTS }],
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
    const picked = await open({ directory: true, multiple: false, title: '选择要上传的文件夹' });
    if (typeof picked !== 'string') return; // cancelled
    try {
      const resolved = await resolveUploadFiles([picked]);
      if (resolved.length === 0) {
        setError('该文件夹内未找到可直接上传的文件。');
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
        message: '上传完成——服务器正在扫描导入。可能需要片刻（若关闭了文件夹监视，则需一次书库扫描）。',
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
        st.setToast({ message: '上传已取消', type: 'info' });
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
      style={{
        position: 'fixed', inset: 0, zIndex: 2000,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'rgba(0,0,0,0.72)', backdropFilter: 'blur(10px)', WebkitBackdropFilter: 'blur(10px)',
        padding: 24,
      }}
      // Backdrop click closes only while idle — never abandon an active upload silently.
      onMouseDown={e => { if (e.target === e.currentTarget && !uploading) onClose(); }}
    >
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="upload-dialog-title" style={{
        width: 460, maxHeight: '80vh',
        background: 'var(--onyx-panel)', border: '1px solid var(--onyx-glass-edge)',
        borderRadius: 16,
        boxShadow: '0 40px 100px rgba(0,0,0,0.72), 0 0 0 1px rgba(var(--onyx-accent-r),var(--onyx-accent-g),var(--onyx-accent-b),0.06), inset 0 1px 0 rgba(255,255,255,0.04)',
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
      }}>
        {/* Header */}
        <div style={{ flexShrink: 0, padding: '20px 20px 0 22px', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
          <div style={{ minWidth: 0 }}>
            <div id="upload-dialog-title" style={{ fontFamily: SERIF, fontSize: 19, fontWeight: 500, letterSpacing: '-0.015em', lineHeight: 1.1 }}>
              上传到“{lib.name}”
            </div>
            <div style={{ fontFamily: MONO, fontSize: 10, color: 'var(--onyx-text-mute)', letterSpacing: '0.06em', marginTop: 6 }}>
              {isPodcast ? '新播客——文件将上传到服务器' : '新图书——文件将上传到服务器'}
            </div>
          </div>
          <button
            aria-label="关闭上传"
            onClick={() => { if (!uploading) onClose(); }}
            disabled={uploading}
            style={{ width: 28, height: 28, borderRadius: 7, background: 'none', border: '1px solid transparent', color: 'var(--onyx-text-mute)', cursor: uploading ? 'default' : 'pointer', opacity: uploading ? 0.4 : 1, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, lineHeight: 1, flexShrink: 0, marginTop: 1 }}
          >✕</button>
        </div>
        <div style={{ flexShrink: 0, height: 1, background: 'var(--onyx-line)', margin: '14px 0 0' }} />

        {/* Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 22px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* Pickers */}
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => void pickFiles()} disabled={uploading} style={{ ...pickerBtn, opacity: uploading ? 0.4 : 1, cursor: uploading ? 'default' : 'pointer' }}>
              <Icon name="plus" size={12} /> 添加文件
            </button>
            <button onClick={() => void pickFolder()} disabled={uploading} style={{ ...pickerBtn, opacity: uploading ? 0.4 : 1, cursor: uploading ? 'default' : 'pointer' }}>
              <Icon name="plus" size={12} /> 添加文件夹
            </button>
          </div>

          {/* File list */}
          {files.length > 0 && (
            <div style={{ border: '1px solid var(--onyx-line)', borderRadius: 8, overflow: 'hidden' }}>
              <div style={{ maxHeight: 168, overflowY: 'auto' }}>
                {files.map(f => (
                  <div key={f.path} style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '7px 11px', borderBottom: '1px solid var(--onyx-line)' }}>
                    <Icon name="file" size={13} color="var(--onyx-text-mute)" />
                    <span title={f.path} style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 12.5 }}>{f.name}</span>
                    <span style={{ fontFamily: MONO, fontSize: 10, color: 'var(--onyx-text-mute)', flexShrink: 0 }}>{fmtBytes(f.size)}</span>
                    {!uploading && (
                      <button
                        onClick={() => setFiles(prev => prev.filter(x => x.path !== f.path))}
                        title="移除"
                        style={{ flexShrink: 0, width: 18, height: 18, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'transparent', border: 'none', color: 'var(--onyx-text-mute)', fontSize: 11, cursor: 'pointer', padding: 0, lineHeight: 1 }}
                      >✕</button>
                    )}
                  </div>
                ))}
              </div>
              <div style={{ padding: '6px 11px', fontFamily: MONO, fontSize: 10, color: 'var(--onyx-text-mute)', letterSpacing: '0.04em' }}>
                {files.length} 个文件 · {fmtBytes(totalBytes)}
              </div>
            </div>
          )}

          {/* Fields — Title always; Author/Series for book libraries only (the
              server ignores them for podcasts, whose dir is just folder/title). */}
          <div>
            <label style={labelStyle}>标题 *</label>
            <input
              type="text" value={title} onChange={e => setTitle(e.target.value)} disabled={uploading}
              placeholder={isPodcast ? '播客标题…' : '图书标题…'}
              onFocus={e => { e.currentTarget.style.borderColor = 'var(--onyx-accent-edge)'; }}
              onBlur={e => { e.currentTarget.style.borderColor = 'var(--onyx-glass-edge)'; }}
              style={fieldStyle}
            />
          </div>
          {!isPodcast && (
            <div style={{ display: 'flex', gap: 10 }}>
              <div style={{ flex: 1 }}>
                <label style={labelStyle}>作者</label>
                <input
                  type="text" value={author} onChange={e => setAuthor(e.target.value)} disabled={uploading}
                  placeholder="作者…"
                  onFocus={e => { e.currentTarget.style.borderColor = 'var(--onyx-accent-edge)'; }}
                  onBlur={e => { e.currentTarget.style.borderColor = 'var(--onyx-glass-edge)'; }}
                  style={fieldStyle}
                />
              </div>
              <div style={{ flex: 1 }}>
                <label style={labelStyle}>系列</label>
                <input
                  type="text" value={series} onChange={e => setSeries(e.target.value)} disabled={uploading}
                  placeholder="系列…"
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
              <label style={labelStyle}>服务器文件夹</label>
              <div style={{ border: '1px solid var(--onyx-line)', borderRadius: 8, overflow: 'hidden' }}>
                {folders.map(f => {
                  const active = f.id === folderId;
                  return (
                    <button
                      key={f.id}
                      onClick={() => { if (!uploading) setFolderId(f.id!); }}
                      disabled={uploading}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 9, width: '100%', padding: '8px 11px',
                        background: active ? 'var(--onyx-accent-dim)' : 'transparent',
                        border: 'none', borderLeft: `2px solid ${active ? 'var(--onyx-accent)' : 'transparent'}`,
                        color: active ? 'var(--onyx-accent)' : 'var(--onyx-text)',
                        fontSize: 12.5, textAlign: 'left', fontFamily: MONO,
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
            <div style={{ fontSize: 12, color: '#e8716a', fontFamily: MONO }}>
              此书库没有可上传的文件夹。
            </div>
          )}

          {dupNames.length > 0 && (
            <div style={{ fontSize: 12, color: '#e8716a', fontFamily: MONO, wordBreak: 'break-word' }}>
              存在重复文件名：{dupNames.join(', ')}——服务器会把所有文件放入同一文件夹，重复文件会被覆盖丢失。请移除或重命名重复文件。
            </div>
          )}

          {error && (
            <div style={{ fontSize: 12, color: '#e8716a', fontFamily: MONO, wordBreak: 'break-word' }}>{error}</div>
          )}
        </div>

        {/* Footer — progress bar while uploading, action buttons while idle. */}
        <div style={{ flexShrink: 0, padding: '12px 16px 16px', borderTop: '1px solid var(--onyx-line)' }}>
          {uploading ? (
            <div>
              <div style={{ height: 4, borderRadius: 2, background: 'var(--onyx-glass-edge)', overflow: 'hidden', marginBottom: 8 }}>
                <div style={{ height: '100%', width: `${pct}%`, background: 'var(--onyx-accent)', borderRadius: 2, transition: 'width 0.2s ease' }} />
              </div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                <span style={{ fontFamily: MONO, fontSize: 10, color: 'var(--onyx-text-mute)' }}>
                  {fmtBytes(progress.bytesSent)} / {fmtBytes(progress.totalBytes)}
                </span>
                <button
                  onClick={() => { if (uploadIdRef.current) void cancelUpload(uploadIdRef.current).catch(e => log.error('library', 'cancelUpload failed', { err: String(e) })); }}
                  style={{ fontFamily: MONO, fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', padding: '7px 12px', borderRadius: 8, cursor: 'pointer', background: 'transparent', border: '1px solid var(--onyx-glass-edge)', color: 'var(--onyx-text-dim)' }}
                >取消</button>
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={onClose}
                style={{ flex: 1, fontFamily: MONO, fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', padding: '9px 14px', borderRadius: 8, cursor: 'pointer', background: 'transparent', border: '1px solid var(--onyx-glass-edge)', color: 'var(--onyx-text-dim)' }}
              >取消</button>
              <button
                onClick={() => void startUpload()}
                disabled={!canStart}
                style={{
                  flex: 2, fontFamily: MONO, fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase',
                  padding: '9px 14px', borderRadius: 8, fontWeight: 600, border: '1px solid transparent',
                  background: canStart ? 'var(--onyx-accent)' : 'var(--onyx-accent-dim)',
                  color: canStart ? 'var(--onyx-bg)' : 'var(--onyx-text-mute)',
                  cursor: canStart ? 'pointer' : 'default',
                }}
              >
                {files.length > 0 ? `上传 ${files.length} 个文件` : '上传'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );

  return ReactDOM.createPortal(modal, document.body);
}
