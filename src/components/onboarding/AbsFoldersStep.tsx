// Step 3b — Folders (ABS). Shows where downloaded audio is stored and lets the
// user relocate it up front. Only the DOWNLOADS root is exposed here; the cover
// cache is relocatable too but only from Settings → Downloads (Resolved decisions
// #1–2). (First-Launch Onboarding, Phase 4.)
import { useState, useEffect } from 'react';
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
  const [dir, setDir] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => { getDownloadsDir().then(setDir).catch(() => {}); }, []);

  async function relocate() {
    const picked = await open({ directory: true, multiple: false, title: '选择下载内容的存储位置' });
    if (typeof picked !== 'string') return;
    try {
      setBusy(true);
      log.info('app', 'onboarding relocate downloads dir');
      await setDownloadsDir(picked);
      const next = await getDownloadsDir();
      setDir(next);
      st.setToast({ message: '下载文件夹已更新', type: 'success' });
    } catch (e) {
      log.error('app', 'onboarding relocate downloads dir failed', { err: String(e) });
      st.setToast({ message: '无法移动下载文件夹', type: 'error' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ fontFamily: MONO, fontSize: 9.5, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(235,231,223,0.45)' }}>
          下载文件夹
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <input
            readOnly
            value={dir || '加载中…'}
            title={dir}
            onFocus={e => e.currentTarget.select()}
            style={{
              flex: 1, minWidth: 260, fontFamily: MONO, fontSize: 11.5, color: 'rgba(235,231,223,0.75)',
              background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8,
              padding: '9px 12px', outline: 'none', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}
          />
          <button
            type="button"
            onClick={relocate}
            disabled={busy}
            style={{
              padding: '9px 16px', fontFamily: MONO, fontSize: 10, letterSpacing: '0.08em', textTransform: 'uppercase',
              background: 'transparent', border: '1px solid rgba(255,255,255,0.14)', borderRadius: 8,
              color: 'rgba(235,231,223,0.7)', cursor: busy ? 'wait' : 'pointer',
            }}
          >
            {busy ? '移动中…' : '更改…'}
          </button>
        </div>
        <div style={{ fontFamily: SANS, fontSize: 12, color: 'rgba(235,231,223,0.45)', lineHeight: 1.5, maxWidth: 460 }}>
          你下载用于离线收听的书存放在这里。可以保持默认位置——Skald 会替你管理——也可以移动到空间更大的磁盘。日后如需更改（或一并移动封面缓存），可在{' '}<span style={{ color: 'rgba(235,231,223,0.7)' }}>设置 → 下载</span>中操作。
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
        <GoldButton onClick={onContinue}>继续</GoldButton>
        <span style={{ fontFamily: SERIF, fontStyle: 'italic', fontSize: 12.5, color: 'rgba(235,231,223,0.4)' }}>
          对大多数人来说，默认位置即可。
        </span>
      </div>
    </div>
  );
}
