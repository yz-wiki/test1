// Modal ABS server-filesystem browser used by the library form's folder rows.
// Moved verbatim out of LibrariesSection.tsx (God-File Decomposition roadmap, L3/L7).
import { useState, useEffect } from 'react';
import { useI18n } from '../../../i18n';
import { MONO, SERIF } from '../shared';
import { browseServerFilesystem } from '../../../api/abs';
import type { FsEntry } from '../../../api/abs';
import { SmallBtn } from './widgets';
import { useModalFocus } from '../../../hooks/useModalFocus';
import { errorMessage } from '../../../lib/presentError';
import { log } from '../../../lib/log';

export interface ServerFolderPickerProps {
  serverUrl: string;
  initial: string;          // pre-navigate to this path if non-empty, else "/"
  onSelect: (path: string) => void;
  onCancel: () => void;
}

export default function ServerFolderPicker({ serverUrl, initial, onSelect, onCancel }: ServerFolderPickerProps) {
  const { t } = useI18n();
  const startPath = initial.trim() || '/';
  const [currentPath, setCurrentPath] = useState(startPath);
  const [entries, setEntries] = useState<FsEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const dialogRef = useModalFocus<HTMLDivElement>(onCancel, !loading);

  // Fetch whenever the path changes.
  useEffect(() => { void navigate(currentPath); }, [currentPath]); // eslint-disable-line react-hooks/exhaustive-deps

  async function navigate(path: string) {
    setLoading(true);
    setError('');
    try {
      const result = await browseServerFilesystem(serverUrl, path);
      // ABS response has no top-level path field — keep the path we requested.
      setCurrentPath(path);
      setEntries(result.directories.slice().sort((a, b) => a.dirname.localeCompare(b.dirname)));
    } catch (e) {
      log.warn('library', 'server folder browse failed', { err: String(e) });
      setError(errorMessage(e, { operation: 'refresh' }));
    } finally {
      setLoading(false);
    }
  }

  // Split current path into breadcrumb segments for navigation.
  function breadcrumbs(): { label: string; path: string }[] {
    const parts = currentPath.replace(/\\/g, '/').split('/').filter(Boolean);
    const crumbs = [{ label: '/', path: '/' }];
    let accumulated = '';
    for (const part of parts) {
      accumulated += '/' + part;
      crumbs.push({ label: part, path: accumulated });
    }
    return crumbs;
  }

  // Parent path: strip the last segment.
  function parentPath(): string {
    const norm = currentPath.replace(/\\/g, '/').replace(/\/$/, '');
    const idx = norm.lastIndexOf('/');
    return idx <= 0 ? '/' : norm.slice(0, idx);
  }

  const crumbs = breadcrumbs();
  const canGoUp = currentPath !== '/' && currentPath !== '';

  return (
    <div
      className="ui-scrim"  style={{ zIndex: 600 }}
      onMouseDown={e => { if (e.target === e.currentTarget) onCancel(); }}
    >
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="server-folder-title" style={{
        width: 540, maxWidth: '92vw', maxHeight: '78vh',
        display: 'flex', flexDirection: 'column',
        background: 'var(--surface-overlay)',
        backdropFilter: 'blur(40px) saturate(120%)',
        WebkitBackdropFilter: 'blur(40px) saturate(120%)',
        border: '1px solid var(--onyx-glass-edge)',
        borderRadius: 'var(--r-card)',
        boxShadow: 'var(--shadow-dialog)',
        overflow: 'hidden',
      }}>
        {/* Header */}
        <div style={{
          padding: 'var(--s-4) var(--s-5) var(--s-3)',
          borderBottom: '1px solid var(--onyx-line)',
          flexShrink: 0,
        }}>
          <div id="server-folder-title" style={{ fontFamily: SERIF, fontSize: 'var(--fs-5)', fontWeight: 500, marginBottom: 'var(--s-3)' }}>
            {t('folderPicker.title')}
          </div>

          {/* Breadcrumb strip */}
          <div style={{
            display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '2px 0',
            fontFamily: MONO, fontSize: 'var(--fs-0)', letterSpacing: '0.03em',
            background: 'rgba(0,0,0,0.25)', borderRadius: 'var(--r-sm)',
            padding: 'var(--s-2) var(--s-3)', minHeight: 30,
          }}>
            {crumbs.map((crumb, i) => (
              <span key={crumb.path} style={{ display: 'flex', alignItems: 'center' }}>
                {i > 0 && <span style={{ color: 'var(--onyx-text-mute)', margin: '0 var(--s-1)' }}>/</span>}
                <button
                  onClick={() => setCurrentPath(crumb.path)}
                  style={{
                    background: 'none', border: 'none', padding: '2px var(--s-1)',
                    borderRadius: 'var(--r-xs)', cursor: 'pointer', fontFamily: MONO, fontSize: 'var(--fs-0)',
                    color: i === crumbs.length - 1 ? 'var(--onyx-text)' : 'var(--onyx-accent)',
                    fontWeight: i === crumbs.length - 1 ? 500 : 400,
                  }}
                >
                  {crumb.label}
                </button>
              </span>
            ))}
          </div>
        </div>

        {/* Directory list */}
        <div style={{ flex: 1, overflowY: 'auto', padding: 'var(--s-2) var(--s-2)' }}>
          {loading && (
            <div style={{ padding: 'var(--s-5) var(--s-3)', fontFamily: MONO, fontSize: 'var(--fs-1)', color: 'var(--onyx-text-mute)', letterSpacing: '0.06em' }}>
              Loading…
            </div>
          )}

          {!loading && error && (
            <div style={{ padding: 'var(--s-3)', fontFamily: MONO, fontSize: 'var(--fs-1)', color: '#e8716a' }}>
              {error}
            </div>
          )}

          {!loading && !error && (
            <>
              {/* Up / parent row */}
              {canGoUp && (
                <button
                  onClick={() => setCurrentPath(parentPath())}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 'var(--s-3)',
                    width: '100%', padding: 'var(--s-2) var(--s-3)', borderRadius: 'var(--r-sm)',
                    background: 'transparent', border: 'none',
                    color: 'var(--onyx-text-dim)', fontFamily: MONO, fontSize: 'var(--fs-2)',
                    cursor: 'pointer', textAlign: 'left',
                  }}
                >
                  <span style={{ fontSize: 'var(--fs-4)' }}>↑</span>
                  <span style={{ letterSpacing: '0.02em' }}>..</span>
                </button>
              )}

              {entries.length === 0 && (
                <div style={{ padding: 'var(--s-3)', fontFamily: MONO, fontSize: 'var(--fs-1)', color: 'var(--onyx-text-mute)', letterSpacing: '0.05em' }}>
                  {t('folderPicker.noSubdirs')}
                </div>
              )}

              {entries.map(entry => (
                <button
                  key={entry.path}
                  onClick={() => setCurrentPath(entry.path)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 'var(--s-3)',
                    width: '100%', padding: 'var(--s-2) var(--s-3)', borderRadius: 'var(--r-sm)',
                    background: 'transparent', border: 'none',
                    color: 'var(--onyx-text)', fontFamily: 'inherit', fontSize: 'var(--fs-3)',
                    cursor: 'pointer', textAlign: 'left',
                  }}
                >
                  <span style={{ fontSize: 'var(--fs-4)', flexShrink: 0 }}>📁</span>
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {entry.dirname}
                  </span>
                </button>
              ))}
            </>
          )}
        </div>

        {/* Footer: current selection + action buttons */}
        <div style={{
          padding: 'var(--s-3) var(--s-5)',
          borderTop: '1px solid var(--onyx-line)',
          flexShrink: 0,
          display: 'flex', flexDirection: 'column', gap: 'var(--s-3)',
        }}>
          <div style={{
            fontFamily: MONO, fontSize: 'var(--fs-0)', color: 'var(--onyx-text-mute)',
            letterSpacing: '0.03em', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {currentPath}
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--s-2)' }}>
            <SmallBtn muted onClick={onCancel}>{t('folderPicker.cancel')}</SmallBtn>
            <SmallBtn onClick={() => onSelect(currentPath)} disabled={loading}>
              {t('folderPicker.selectThis')}
            </SmallBtn>
          </div>
        </div>
      </div>
    </div>
  );
}
