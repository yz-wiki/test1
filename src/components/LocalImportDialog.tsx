import { useState } from 'react';
import { useI18n } from '../i18n';
import type { CSSProperties } from 'react';
import ReactDOM from 'react-dom';
import { open } from '@tauri-apps/plugin-dialog';
import type { Library, IngestOutcome, ScannedItem } from '../api/abs';
import { getUnidentifiedItems, ingestLocalPaths, revealPath } from '../api/abs';
import type { OnyxState } from '../state/onyx';
import { log } from '../lib/log';
import { newQuarantineItems, summarizeImport } from '../lib/localImport';
import Icon, { type IconName } from './Icon';
import MatchModal, { makeLocalQuarantineAdapter } from './MatchModal';
import { useModalFocus } from '../hooks/useModalFocus';

// One family for interface text; monospace is opt-in via .ui-tech.
const UI_STACK = 'var(--font-ui)';

const MONO = UI_STACK;
const SERIF = UI_STACK;
const AUDIO_EXTENSIONS = ['m4b', 'm4a', 'mp3', 'flac', 'ogg', 'opus', 'aac', 'wav'];

export interface LocalImportDialogProps {
  st: OnyxState;
  library: Library;
  onClose: () => void;
  onImported?: () => void | Promise<void>;
}

type ImportRoute = 'files' | 'folder';

interface PendingMatch {
  outcomes: IngestOutcome[];
  items: ScannedItem[];
  index: number;
}

function Choice({ icon, title, copy, disabled, onClick }: {
  icon: IconName;
  title: string;
  copy: string;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        display: 'flex', alignItems: 'center', gap: 'var(--s-4)', width: '100%', textAlign: 'left',
        padding: 'var(--s-4) var(--s-4)', borderRadius: 'var(--r-card)',
        background: 'var(--onyx-glass)', border: '1px solid var(--onyx-glass-edge)',
        color: 'var(--onyx-text)', cursor: disabled ? 'wait' : 'pointer', opacity: disabled ? 0.55 : 1,
      }}
    >
      <span style={{ width: 34, height: 34, borderRadius: 'var(--r-md)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, background: 'var(--onyx-accent-dim)', color: 'var(--onyx-accent)', border: '1px solid var(--onyx-accent-edge)' }}>
        <Icon name={icon} size={16} />
      </span>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: 'block', fontSize: 'var(--fs-4)', fontWeight: 600 }}>{title}</span>
        <span style={{ display: 'block', marginTop: 'var(--s-1)', fontSize: 'var(--fs-2)', lineHeight: 1.45, color: 'var(--onyx-text-mute)' }}>{copy}</span>
      </span>
      <Icon name="chevron-right" size={13} color="var(--onyx-text-mute)" />
    </button>
  );
}

export default function LocalImportDialog({ st, library, onClose, onImported }: LocalImportDialogProps) {
  const { t } = useI18n();
  const [busy, setBusy] = useState<ImportRoute | 'staging' | null>(null);
  const [error, setError] = useState('');
  const [pendingMatch, setPendingMatch] = useState<PendingMatch | null>(null);
  const working = busy !== null;
  const dialogRef = useModalFocus<HTMLDivElement>(onClose, !working);

  async function refreshAfterImport() {
    if (st.currentLibraryId === library.id) await st.setActiveLibrary(library.id);
    else await st.refreshLibrary();
    await onImported?.();
  }

  async function finishImport(outcomes: IngestOutcome[], matched: number) {
    const summary = summarizeImport(outcomes, matched);
    const parts = [`${summary.added} added`];
    if (summary.needsAttention) parts.push(`${summary.needsAttention} need attention`);
    if (summary.failed) parts.push(`${summary.failed} failed`);
    log.info('library', 'local import complete', { libraryId: library.id, ...summary });
    st.setToast({
      message: `Imported into "${library.name}" — ${parts.join(', ')}`,
      type: summary.failed && summary.added === 0 ? 'error' : summary.added ? 'success' : 'info',
    });
    onClose();
    try {
      await refreshAfterImport();
    } catch (e) {
      log.error('library', 'refresh after local import failed', { libraryId: library.id, err: String(e) });
    }
  }

  async function ingest(route: ImportRoute, sources: string[]) {
    if (sources.length === 0) return;
    setBusy(route);
    setError('');
    log.info('library', 'local import start', { libraryId: library.id, route, sources: sources.length });
    try {
      const outcomes = await ingestLocalPaths(library.id, sources);
      const quarantined = outcomes.some(outcome => outcome.outcome === 'quarantined');
      if (quarantined) {
        try {
          const items = newQuarantineItems(outcomes, await getUnidentifiedItems(library.id));
          if (items.length > 0) {
            setPendingMatch({ outcomes, items, index: 0 });
            return;
          }
        } catch (e) {
          // Import succeeded; a queue lookup failure must not turn it into a
          // false failure. The existing Needs attention panel remains the fallback.
          log.warn('library', 'local import match queue unavailable', { libraryId: library.id, err: String(e) });
        }
      }
      await finishImport(outcomes, 0);
    } catch (e) {
      log.error('library', 'local import failed', { libraryId: library.id, route, err: String(e) });
      setError('Could not import from that location. Check the Skald log for details.');
    } finally {
      setBusy(null);
    }
  }

  async function pickFiles() {
    const picked = await open({
      directory: false,
      multiple: true,
      title: `Add books to "${library.name}"`,
      filters: [{ name: 'Audiobook files', extensions: AUDIO_EXTENSIONS }],
    });
    const sources = Array.isArray(picked) ? picked : typeof picked === 'string' ? [picked] : [];
    await ingest('files', sources);
  }

  async function pickFolder() {
    const picked = await open({ directory: true, multiple: false, title: `Choose a book folder or parent folder for "${library.name}"` });
    if (typeof picked === 'string') await ingest('folder', [picked]);
  }

  async function openStaging() {
    if (!library.stagingPath) {
      setError('This library does not have a Staging folder configured.');
      return;
    }
    setBusy('staging');
    setError('');
    try {
      await revealPath(library.stagingPath);
      log.info('library', 'open local import staging folder', { libraryId: library.id });
      onClose();
    } catch (e) {
      log.error('library', 'open local import staging folder failed', { libraryId: library.id, err: String(e) });
      setError('Could not open the Staging folder.');
    } finally {
      setBusy(null);
    }
  }

  if (pendingMatch) {
    const target = pendingMatch.items[pendingMatch.index];
    return (
      <MatchModal
        key={target.sourcePath}
        item={target.item}
        adapter={makeLocalQuarantineAdapter(library.id, target)}
        queue={{ index: pendingMatch.index, total: pendingMatch.items.length }}
        onClose={() => void finishImport(pendingMatch.outcomes, pendingMatch.index)}
        onComplete={() => {
          const matched = pendingMatch.index + 1;
          if (matched >= pendingMatch.items.length) void finishImport(pendingMatch.outcomes, matched);
          else setPendingMatch({ ...pendingMatch, index: matched });
        }}
        onRefresh={() => {}}
      />
    );
  }

  const modalStyle: CSSProperties = {
    width: 500, maxWidth: 'calc(100vw - 48px)',
    background: 'var(--surface-overlay)', border: '1px solid var(--onyx-glass-edge)', borderRadius: 'var(--r-overlay)',
    boxShadow: 'var(--shadow-dialog)',
    overflow: 'hidden',
  };

  return ReactDOM.createPortal(
    <div
      className="ui-scrim"  style={{ zIndex: 2000 }}
      onMouseDown={event => { if (event.target === event.currentTarget && !working) onClose(); }}
    >
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="local-import-title" style={modalStyle}>
        <div style={{ padding: 'var(--s-5) var(--s-5) var(--s-4) var(--s-6)', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 'var(--s-4)', borderBottom: '1px solid var(--onyx-line)' }}>
          <div style={{ minWidth: 0 }}>
            <div id="local-import-title" style={{ fontFamily: SERIF, fontSize: 'var(--fs-6)', fontWeight: 500 }}>Add books to “{library.name}”</div>
            <div style={{ fontFamily: MONO, fontSize: 'var(--fs-0)', color: 'var(--onyx-text-mute)', letterSpacing: '0.06em', marginTop: 'var(--s-2)' }}>{t('localImport.chooseMode')}</div>
          </div>
          <button onClick={onClose} aria-label={t('localImport.close')} disabled={working} style={{ width: 28, height: 28, borderRadius: 'var(--r-sm)', background: 'none', border: 'none', color: 'var(--onyx-text-mute)', cursor: working ? 'wait' : 'pointer', opacity: working ? 0.4 : 1, fontSize: 'var(--fs-4)' }}>×</button>
        </div>

        <div style={{ padding: 'var(--s-5) var(--s-6) var(--s-5)', display: 'flex', flexDirection: 'column', gap: 'var(--s-3)' }}>
          <div style={{ padding: 'var(--s-3) var(--s-3)', borderRadius: 'var(--r-md)', background: 'var(--onyx-accent-dim)', border: '1px solid var(--onyx-accent-edge)' }}>
            <div style={{ fontFamily: MONO, fontSize: 'var(--fs-0)', letterSpacing: '0.08em', color: 'var(--onyx-accent)', textTransform: 'uppercase' }}>{t('localImport.whatHappens')}</div>
            <div style={{ marginTop: 'var(--s-2)', fontSize: 'var(--fs-2)', lineHeight: 1.5, color: 'var(--onyx-text-dim)' }}>
              {t('localImport.sourceFiles')}<span aria-hidden="true">→</span> <strong>{library.organizeMode === 'move' ? 'Move after verification' : 'Copy and keep originals'}</strong> <span aria-hidden="true">→</span> {t('localImport.managedLibrary')}<span aria-hidden="true">→</span> {t('localImport.needsAttentionHint')}
            </div>
          </div>
          <Choice icon="file" title={busy === 'files' ? 'Adding files…' : 'Add files'} copy="Choose one or more audiobook files from this PC." disabled={working} onClick={() => void pickFiles()} />
          <Choice icon="layers" title={busy === 'folder' ? 'Scanning folder…' : 'Add folder'} copy="Choose a book folder or a parent folder; Skald will scan and file every book it finds." disabled={working} onClick={() => void pickFolder()} />
          <Choice icon="upload" title={busy === 'staging' ? 'Opening Staging…' : 'Open Staging'} copy="Drop files or folders into the watched Staging folder for automatic import." disabled={working} onClick={() => void openStaging()} />
          {error && <div style={{ marginTop: 'var(--s-1)', padding: 'var(--s-3) var(--s-3)', borderRadius: 'var(--r-md)', background: 'rgba(232,113,106,0.08)', color: '#e8716a', fontFamily: MONO, fontSize: 'var(--fs-0)', lineHeight: 1.45 }}>{error}</div>}
        </div>
      </div>
    </div>,
    document.body,
  );
}
