// Auto-download settings (cluster E). Per-podcast automatic episode download:
// toggle, schedule (cron via the shared CronEditor), and retention limits.
// Persisted through the standard media patch (PATCH /api/items/:id/media).
import { useState } from 'react';
import { useI18n } from '../../i18n';
import ReactDOM from 'react-dom';
import type { OnyxState } from '../../state/onyx';
import { updateMedia, validateCron, updateLocalPodcastSettings, asPodcastItem, type LibraryItem } from '../../api/abs';
import CronEditor from '../settings/CronEditor';
import { useModalFocus } from '../../hooks/useModalFocus';
import { errorMessage } from '../../lib/presentError';
import { log } from '../../lib/log';

// One family for interface text; monospace is opt-in via .ui-tech.
const UI_STACK = 'var(--font-ui)';

const MONO = UI_STACK;
const SERIF = UI_STACK;

export interface PodcastSettingsModalProps {
  st: OnyxState;
  item: LibraryItem;
  onClose: () => void;
  onSaved: () => void;
}

export default function PodcastSettingsModal({ st, item, onClose, onSaved }: PodcastSettingsModalProps) {
  const { t } = useI18n();
  const media = asPodcastItem(item).media;

  const [autoDownload, setAutoDownload] = useState<boolean>(media.autoDownloadEpisodes ?? false);
  const [schedule, setSchedule] = useState<string>(media.autoDownloadSchedule || '0 * * * *');
  const [maxKeep, setMaxKeep] = useState<number>(media.maxEpisodesToKeep ?? 0);
  const [maxNew, setMaxNew] = useState<number>(media.maxNewEpisodesToDownload ?? 3);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const dialogRef = useModalFocus<HTMLDivElement>(onClose, !saving);

  const isLocal = st.activeLibrary?.source === 'local';

  async function save() {
    setSaving(true); setError('');
    try {
      // Validate the cron only when auto-download is on (otherwise schedule is
      // moot). Local libraries have no server validator — accept any 5-field
      // expression (the scheduler evaluates it locally; the CronEditor only emits
      // valid shapes anyway).
      if (autoDownload && !isLocal) {
        const ok = await validateCron(st.serverUrl, schedule).catch(() => false);
        if (!ok) { setError('Schedule is not a valid cron expression.'); setSaving(false); return; }
      }
      if (isLocal) {
        await updateLocalPodcastSettings(
          item.id, autoDownload, autoDownload ? schedule : null,
          Number(maxNew) || 0, Number(maxKeep) || 0,
        );
      } else {
        await updateMedia(st.serverUrl, item.id, {
          autoDownloadEpisodes: autoDownload,
          autoDownloadSchedule: schedule,
          maxEpisodesToKeep: Number(maxKeep) || 0,
          maxNewEpisodesToDownload: Number(maxNew) || 0,
        });
      }
      st.setToast({ message: t('toastMsg.autoDownloadSaved'), type: 'success' });
      onSaved();
      onClose();
    } catch (e) {
      log.warn('library', 'podcast settings save failed', { itemId: item.id, err: String(e) });
      setError(errorMessage(e, { operation: 'save' }));
      setSaving(false);
    }
  }

  const numField = (label: string, hint: string, value: number, set: (n: number) => void) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--s-3)' }}>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 'var(--fs-2)', color: 'var(--onyx-text)' }}>{label}</div>
        <div style={{ fontFamily: MONO, fontSize: 'var(--fs-0)', color: 'var(--onyx-text-mute)', marginTop: 'var(--s-1)' }}>{hint}</div>
      </div>
      <input
        type="number" min={0} value={value}
        onChange={e => set(parseInt(e.target.value || '0', 10))}
        style={{ width: 72, background: 'var(--onyx-bg-deep)', color: 'var(--onyx-text)', border: '1px solid var(--onyx-line)', borderRadius: 'var(--r-sm)', padding: 'var(--s-2) var(--s-2)', fontSize: 'var(--fs-2)', fontFamily: 'inherit' }}
      />
    </div>
  );

  const modal = (
    <div
      className="ui-scrim"  style={{ zIndex: 2000 }}
      onMouseDown={e => { if (e.target === e.currentTarget && !saving) onClose(); }}
    >
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="podcast-settings-title" style={{
        width: 460, maxHeight: '80vh', background: 'var(--surface-overlay)', border: '1px solid var(--onyx-line)',
        borderRadius: 'var(--r-card)', boxShadow: 'var(--shadow-dialog)', display: 'flex', flexDirection: 'column',
      }}>
        <div style={{ padding: 'var(--s-5) var(--s-5) var(--s-4)', borderBottom: '1px solid var(--onyx-line)' }}>
          <div id="podcast-settings-title" style={{ fontFamily: SERIF, fontSize: 'var(--fs-5)', fontWeight: 500, color: 'var(--onyx-text)' }}>{t('podSettings.autoDownload')}</div>
          <div style={{ fontFamily: MONO, fontSize: 'var(--fs-0)', color: 'var(--onyx-text-mute)', marginTop: 'var(--s-1)', letterSpacing: '0.04em' }}>
            {media.metadata?.title ?? ''}
          </div>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: 'var(--s-4) var(--s-5)', display: 'flex', flexDirection: 'column', gap: 'var(--s-4)' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 'var(--s-3)', cursor: 'pointer' }}>
            <input type="checkbox" checked={autoDownload} onChange={e => setAutoDownload(e.target.checked)} />
            <div style={{ fontSize: 'var(--fs-3)', color: 'var(--onyx-text)' }}>{t('podSettings.autoDownloadHint')}</div>
          </label>

          {autoDownload && (
            <>
              <div>
                <div style={{ fontFamily: MONO, fontSize: 'var(--fs-0)', color: 'var(--onyx-text-dim)', letterSpacing: '0.06em', marginBottom: 'var(--s-2)' }}>{t('podSettings.checkSchedule')}</div>
                <CronEditor value={schedule} onChange={setSchedule} />
              </div>
              {numField('Max episodes to keep', '0 = keep all episodes', maxKeep, setMaxKeep)}
              {numField('Max new per check', 'cap downloads per scheduled check', maxNew, setMaxNew)}
            </>
          )}

          {error && <div style={{ fontSize: 'var(--fs-2)', color: '#e8716a' }}>{error}</div>}
        </div>

        <div style={{ padding: 'var(--s-3) var(--s-5)', borderTop: '1px solid var(--onyx-line)', display: 'flex', justifyContent: 'flex-end', gap: 'var(--s-3)' }}>
          <button onClick={onClose} disabled={saving} style={{ background: 'none', border: 'none', cursor: saving ? 'default' : 'pointer', fontFamily: MONO, fontSize: 'var(--fs-1)', letterSpacing: '0.06em', color: 'var(--onyx-text-dim)' }}>{t('podSettings.cancel')}</button>
          <button
            onClick={save}
            disabled={saving}
            style={{
              padding: 'var(--s-3) var(--s-4)', borderRadius: 'var(--r-md)', border: 'none', cursor: saving ? 'default' : 'pointer',
              background: saving ? 'var(--onyx-line)' : 'var(--onyx-accent)', color: saving ? 'var(--onyx-text-mute)' : 'var(--onyx-bg)',
              fontFamily: MONO, fontSize: 'var(--fs-1)', letterSpacing: '0.06em', fontWeight: 600,
            }}
          >{saving ? 'Saving…' : 'Save'}</button>
        </div>
      </div>
    </div>
  );

  return ReactDOM.createPortal(modal, document.body);
}
