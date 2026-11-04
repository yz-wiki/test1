import { useState, useEffect } from 'react';
import { useI18n } from '../../i18n';
import type { CSSProperties } from 'react';
import ReactDOM from 'react-dom';
import { fetchItem } from '../../api/abs';
import type { LibraryFile } from '../../api/abs';
import { useModalFocus } from '../../hooks/useModalFocus';
import { errorMessage } from '../../lib/presentError';
import { log } from '../../lib/log';

// One family for interface text; monospace is opt-in via .ui-tech.
const UI_STACK = 'var(--font-ui)';

const MONO = UI_STACK;
const SERIF = UI_STACK;
const SANS = UI_STACK;

// Muted gold tint for the column headers — accent hue, dimmed so it reads as a
// label rather than competing with the type badges below.
const HEAD_ACCENT = 'rgba(var(--onyx-accent-r),var(--onyx-accent-g),var(--onyx-accent-b),0.65)';

export interface FilesModalProps {
  bookId: string;
  serverUrl: string;
  onClose: () => void;
}

function fmtSize(bytes: number): string {
  if (bytes >= 1_000_000_000) return `${(bytes / 1_000_000_000).toFixed(1)} GB`;
  if (bytes >= 1_000_000)     return `${(bytes / 1_000_000).toFixed(1)} MB`;
  if (bytes >= 1_000)         return `${(bytes / 1_000).toFixed(1)} KB`;
  return `${bytes} B`;
}

// Per-file-type badge palette. Audio reuses the gold accent (the common case,
// fully on-brand); image/ebook/video get contained, desaturated tints. Every
// other ABS fileType (text, metadata, unknown…) falls back to neutral gray so
// the colour accents stay reserved for the primary media kinds.
const TYPE_COLORS: Record<string, { fg: string; border: string; bg: string }> = {
  audio: { fg: 'var(--onyx-accent)', border: 'var(--onyx-accent-edge)', bg: 'var(--onyx-accent-dim)' },
  image: { fg: '#52b2cc', border: 'rgba(82,178,204,0.40)', bg: 'rgba(82,178,204,0.13)' },
  ebook: { fg: '#ab8fd6', border: 'rgba(171,143,214,0.38)', bg: 'rgba(171,143,214,0.12)' },
  video: { fg: '#6cc0a0', border: 'rgba(108,192,160,0.38)', bg: 'rgba(108,192,160,0.12)' },
};
const TYPE_NEUTRAL = { fg: 'var(--onyx-text-dim)', border: 'var(--onyx-glass-edge)', bg: 'rgba(255,255,255,0.04)' };

function TypeBadge({ fileType }: { fileType: string }) {
  const c = TYPE_COLORS[fileType?.toLowerCase()] ?? TYPE_NEUTRAL;
  return (
    <span style={{
      display: 'inline-block', fontFamily: MONO, fontSize: 'var(--fs-0)', letterSpacing: '0.1em',
      textTransform: 'uppercase', color: c.fg, background: c.bg, border: `1px solid ${c.border}`,
      borderRadius: 'var(--r-sm)', padding: 'var(--s-1) var(--s-2)', lineHeight: 1, whiteSpace: 'nowrap',
    }}>{fileType}</span>
  );
}

// Render a filename with the human title in bright sans and the trailing
// "[ASIN].ext" (or bare extension) in dim mono — matching the reference. A
// leading "[" splits title from code; otherwise the final extension is dimmed.
function renderName(filename: string) {
  const title: CSSProperties = { fontFamily: SANS, fontSize: 'var(--fs-4)', color: 'var(--onyx-text)' };
  const code: CSSProperties = { fontFamily: MONO, fontSize: 'var(--fs-2)', color: 'var(--onyx-text-dim)' };

  const bracket = filename.match(/^(.*?)(\s*\[[^\]]*\].*)$/);
  if (bracket) {
    return <><span style={title}>{bracket[1].trimEnd()}</span> <span style={code}>{bracket[2].trimStart()}</span></>;
  }
  const dot = filename.lastIndexOf('.');
  if (dot > 0) {
    return <><span style={title}>{filename.slice(0, dot)}</span><span style={code}>{filename.slice(dot)}</span></>;
  }
  return <span style={title}>{filename}</span>;
}

export default function FilesModal({ bookId, serverUrl, onClose }: FilesModalProps) {
  const { t } = useI18n();
  const [files, setFiles] = useState<LibraryFile[] | null>(null);
  const [error, setError] = useState('');
  const [fullPath, setFullPath] = useState(false);
  const dialogRef = useModalFocus<HTMLDivElement>(onClose);

  useEffect(() => {
    fetchItem(serverUrl, bookId)
      .then(item => setFiles(item.libraryFiles ?? []))
      .catch(e => { log.warn('library', 'library files load failed', { bookId, err: String(e) }); setError(errorMessage(e, { operation: 'refresh' })); });
  }, [serverUrl, bookId]);

  const modal = (
    <div
      className="ui-scrim"  style={{ zIndex: 2000 }}
      onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="library-files-title" style={{
        width: 620,
        maxWidth: '90vw',
        background: 'var(--surface-overlay)',
        border: '1px solid var(--onyx-line)',
        borderRadius: 'var(--r-overlay)',
        boxShadow: 'var(--shadow-dialog)',
        display: 'flex',
        flexDirection: 'column',
        maxHeight: '70vh',
      }}>
        {/* Header */}
        <div style={{ padding: 'var(--s-5) var(--s-6) var(--s-4)', borderBottom: '1px solid var(--onyx-line)', display: 'flex', alignItems: 'baseline', gap: 'var(--s-3)' }}>
          <div id="library-files-title" style={{ fontFamily: SERIF, fontSize: 'var(--fs-5)', fontWeight: 500, color: 'var(--onyx-text)' }}>
            {t('filesModal.title')}
          </div>
          {files !== null && (
            <div style={{ fontFamily: MONO, fontSize: 'var(--fs-0)', color: 'var(--onyx-text-mute)', letterSpacing: '0.08em' }}>
              {files.length} {files.length === 1 ? 'file' : 'files'}
            </div>
          )}
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 'var(--s-2)', alignItems: 'center' }}>
            <button
              onClick={() => setFullPath(p => !p)}
              style={{
                background: fullPath ? 'var(--onyx-accent-dim)' : 'transparent',
                border: `1px solid ${fullPath ? 'var(--onyx-accent-edge)' : 'var(--onyx-glass-edge)'}`,
                borderRadius: 'var(--r-md)',
                color: fullPath ? 'var(--onyx-accent)' : 'var(--onyx-text-dim)',
                fontFamily: MONO,
                fontSize: 'var(--fs-0)',
                letterSpacing: '0.08em',
                textTransform: 'uppercase' as const,
                padding: 'var(--s-2) var(--s-4)',
                cursor: 'pointer',
              }}
            >
              {t('filesModal.fullPath')}
            </button>
            <button
              onClick={onClose}
              style={{
                background: 'transparent',
                border: '1px solid var(--onyx-glass-edge)',
                borderRadius: 'var(--r-md)',
                color: 'var(--onyx-text-dim)',
                fontFamily: MONO,
                fontSize: 'var(--fs-0)',
                letterSpacing: '0.08em',
                textTransform: 'uppercase' as const,
                padding: 'var(--s-2) var(--s-4)',
                cursor: 'pointer',
              }}
            >
              {t('filesModal.close')}
            </button>
          </div>
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {files === null && !error && (
            <div style={{ padding: 'var(--s-6)', fontFamily: MONO, fontSize: 'var(--fs-1)', color: 'var(--onyx-text-mute)', letterSpacing: '0.06em' }}>
              Loading…
            </div>
          )}
          {error && (
            <div style={{ padding: 'var(--s-4) var(--s-6)', fontSize: 'var(--fs-2)', color: '#e8716a' }}>{error}</div>
          )}
          {files !== null && files.length === 0 && (
            <div style={{ padding: 'var(--s-6)', fontFamily: MONO, fontSize: 'var(--fs-1)', color: 'var(--onyx-text-mute)', letterSpacing: '0.04em' }}>
              {t('filesModal.empty')}
            </div>
          )}
          {files !== null && files.length > 0 && (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--onyx-line)' }}>
                  {(['PATH', 'SIZE', 'TYPE'] as const).map(h => (
                    <th key={h} style={{
                      padding: 'var(--s-2) var(--s-6)',
                      fontFamily: MONO, fontSize: 'var(--fs-0)', letterSpacing: '0.12em',
                      textTransform: 'uppercase', color: HEAD_ACCENT,
                      fontWeight: 400, textAlign: 'left',
                    }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {files.map((f, i) => (
                  <tr
                    key={f.ino}
                    style={{ borderBottom: i < files.length - 1 ? '1px solid var(--onyx-line)' : 'none' }}
                  >
                    <td style={{ padding: 'var(--s-3) var(--s-6)', wordBreak: 'break-all' }}>
                      {fullPath
                        ? <span style={{ fontFamily: MONO, fontSize: 'var(--fs-2)', color: 'var(--onyx-text-dim)' }}>{f.metadata.path ?? f.metadata.filename}</span>
                        : renderName(f.metadata.filename)}
                    </td>
                    <td style={{ padding: 'var(--s-3) var(--s-6)', fontFamily: MONO, fontSize: 'var(--fs-1)', color: 'var(--onyx-text-dim)', whiteSpace: 'nowrap' }}>
                      {fmtSize(f.metadata.size)}
                    </td>
                    <td style={{ padding: 'var(--s-3) var(--s-6)', whiteSpace: 'nowrap' }}>
                      <TypeBadge fileType={f.fileType} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );

  return ReactDOM.createPortal(modal, document.body);
}
