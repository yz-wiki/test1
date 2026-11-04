// Step 3b — Folders (ABS). Shows where downloaded audio is stored and lets the
// user relocate it up front. Only the DOWNLOADS root is exposed here; the cover
// cache is relocatable too but only from Settings → Downloads (Resolved decisions
// #1–2). (First-Launch Onboarding, Phase 4.)
import { useState, useEffect } from 'react';
import { useI18n } from '../../i18n';
import { open } from '@tauri-apps/plugin-dialog';
import type { OnyxState } from '../../state/onyx';
import { getDownloadsDir, setDownloadsDir } from '../../api/abs';
import { log } from '../../lib/log';
import { GoldButton, SERIF, MONO, SANS } from './frame';

export interface AbsFoldersStepProps {
  st: OnyxState;
  onContinue: () => void;
}

export default function AbsFoldersStep({ st, onContinue }: AbsFoldersStepProps) {
  const { t } = useI18n();
  const [dir, setDir] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => { getDownloadsDir().then(setDir).catch(() => {}); }, []);

  async function relocate() {
    const picked = await open({ directory: true, multiple: false, title: 'Choose where to store downloads' });
    if (typeof picked !== 'string') return;
    try {
      setBusy(true);
      log.info('app', 'onboarding relocate downloads dir');
      await setDownloadsDir(picked);
      const next = await getDownloadsDir();
      setDir(next);
      st.setToast({ message: t('toastMsg.downloadsFolderUpdated'), type: 'success' });
    } catch (e) {
      log.error('app', 'onboarding relocate downloads dir failed', { err: String(e) });
      st.setToast({ message: t('toastMsg.moveDownloadsFailed'), type: 'error' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-6)' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-2)' }}>
        <div style={{ fontFamily: MONO, fontSize: 'var(--fs-0)', letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--onyx-text-dim)' }}>
          {t('onbFolders.downloadsFolder')}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--s-3)', flexWrap: 'wrap' }}>
          <input
            readOnly
            value={dir || 'Loading…'}
            title={dir}
            onFocus={e => e.currentTarget.select()}
            style={{
              flex: 1, minWidth: 260, fontFamily: MONO, fontSize: 'var(--fs-2)', color: 'var(--onyx-text)',
              background: 'var(--onyx-bg-deep)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 'var(--r-md)',
              padding: 'var(--s-3) var(--s-3)', outline: 'none', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}
          />
          <button
            type="button"
            onClick={relocate}
            disabled={busy}
            style={{
              padding: 'var(--s-3) var(--s-4)', fontFamily: MONO, fontSize: 'var(--fs-0)', letterSpacing: '0.08em', textTransform: 'uppercase',
              background: 'transparent', border: '1px solid rgba(255,255,255,0.14)', borderRadius: 'var(--r-md)',
              color: 'var(--onyx-text)', cursor: busy ? 'wait' : 'pointer',
            }}
          >
            {busy ? 'Moving…' : 'Change…'}
          </button>
        </div>
        <div style={{ fontFamily: SANS, fontSize: 'var(--fs-2)', color: 'var(--onyx-text-dim)', lineHeight: 1.5, maxWidth: 460 }}>
          Books you download for offline listening are kept here. You can leave it as the default — Skald
          manages it for you — or move it to a drive with more room. Changing it later (and relocating the
          cover cache) lives in <span style={{ color: 'var(--onyx-text)' }}>Settings → Downloads</span>.
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--s-5)' }}>
        <GoldButton onClick={onContinue}>{t('onbFolders.continue')}</GoldButton>
        <span style={{ fontFamily: SERIF, fontStyle: 'italic', fontSize: 'var(--fs-2)', color: 'var(--onyx-text-dim)' }}>
          {t('onbFolders.defaultFine')}
        </span>
      </div>
    </div>
  );
}
