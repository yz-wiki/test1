// Self-service change-password modal (cluster H).
// Moved verbatim out of AccountSection.tsx (God-File Decomposition roadmap, L3/L7).
import { useState } from 'react';
import { useI18n } from '../../../i18n';
import { SERIF, MONO } from '../shared';
import { changePassword } from '../../../api/abs';
import { useModalFocus } from '../../../hooks/useModalFocus';
import { errorMessage } from '../../../lib/presentError';
import { log } from '../../../lib/log';

// ── Shared modal field styles ────────────────────────────────────────────────
const fieldLabelStyle: React.CSSProperties = {
  fontFamily: MONO, fontSize: 'var(--fs-0)', letterSpacing: '0.1em', textTransform: 'uppercase',
  color: 'var(--onyx-text-mute)', marginBottom: 'var(--s-2)',
};
const fieldInputStyle: React.CSSProperties = {
  width: '100%', boxSizing: 'border-box', padding: 'var(--s-3) var(--s-3)', background: 'rgba(0,0,0,0.25)',
  border: '1px solid var(--onyx-glass-edge)', borderRadius: 'var(--r-sm)', color: 'var(--onyx-text)',
  fontSize: 'var(--fs-3)', outline: 'none', fontFamily: 'inherit',
};
const ghostBtnStyle: React.CSSProperties = {
  padding: 'var(--s-2) var(--s-5)', background: 'transparent', border: '1px solid var(--onyx-glass-edge)',
  borderRadius: 'var(--r-sm)', color: 'var(--onyx-text-dim)', fontFamily: MONO, fontSize: 'var(--fs-1)',
  letterSpacing: '0.07em', textTransform: 'uppercase', cursor: 'pointer',
};
const brassBtnStyle: React.CSSProperties = {
  // Theme accent (follows the selected accent), not a hardcoded gold gradient.
  padding: 'var(--s-2) var(--s-5)', background: 'var(--onyx-accent)',
  border: '1px solid var(--onyx-accent-edge)',
  borderRadius: 'var(--r-sm)', color: 'var(--onyx-bg)', fontFamily: MONO, fontSize: 'var(--fs-1)', letterSpacing: '0.07em',
  textTransform: 'uppercase', cursor: 'pointer', fontWeight: 600,
};

/** Self-service password change (PATCH /api/me/password). Guests are blocked
 *  server-side; the caller hides this for guest accounts. */
export default function ChangePasswordModal({ serverUrl, onClose }: { serverUrl: string; onClose: () => void }) {
  const { t } = useI18n();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const dialogRef = useModalFocus<HTMLFormElement>(onClose, !pending);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!next) return setError('Enter a new password.');
    if (next !== confirm) return setError('New passwords do not match.');
    setError('');
    setPending(true);
    try {
      await changePassword(serverUrl, current, next);
      setDone(true);
    } catch (err) {
      log.warn('auth', 'password change failed', { err: String(err) });
      setError(errorMessage(err, { operation: 'save' }));
      setPending(false);
    }
  };

  return (
    <div
      className="ui-scrim"  style={{ zIndex: 500 }}
      onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <form
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="change-password-title"
        onSubmit={submit}
        style={{ width: 400, maxWidth: '90vw', background: 'var(--surface-overlay)', backdropFilter: 'blur(40px) saturate(120%)', WebkitBackdropFilter: 'blur(40px) saturate(120%)', border: '1px solid var(--onyx-glass-edge)', borderRadius: 'var(--r-card)', boxShadow: 'var(--shadow-dialog)', padding: 'var(--s-6) var(--s-6) var(--s-6)', display: 'flex', flexDirection: 'column', gap: 'var(--s-5)' }}
      >
        <div id="change-password-title" style={{ fontFamily: SERIF, fontSize: 'var(--fs-6)', fontWeight: 500, color: 'var(--onyx-text)' }}>{t('chpw.title')}</div>
        {done ? (
          <>
            <div style={{ fontSize: 'var(--fs-3)', color: 'var(--onyx-text-dim)', lineHeight: 1.5 }}>
              {t('chpw.success')}
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button type="button" onClick={onClose} style={brassBtnStyle}>{t('chpw.done')}</button>
            </div>
          </>
        ) : (
          <>
            <div>
              <div style={fieldLabelStyle}>{t('chpw.current')}</div>
              <input style={fieldInputStyle} type="password" value={current} onChange={e => setCurrent(e.target.value)} autoFocus />
            </div>
            <div>
              <div style={fieldLabelStyle}>{t('chpw.new')}</div>
              <input style={fieldInputStyle} type="password" value={next} onChange={e => setNext(e.target.value)} />
            </div>
            <div>
              <div style={fieldLabelStyle}>{t('chpw.confirm')}</div>
              <input style={fieldInputStyle} type="password" value={confirm} onChange={e => setConfirm(e.target.value)} />
            </div>
            {error && <div style={{ fontSize: 'var(--fs-2)', color: '#e8716a', fontFamily: MONO }}>{error}</div>}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--s-2)', marginTop: 'var(--s-1)' }}>
              <button type="button" onClick={onClose} style={ghostBtnStyle}>{t('chpw.cancel')}</button>
              <button type="submit" disabled={pending} style={{ ...brassBtnStyle, cursor: pending ? 'wait' : 'pointer' }}>
                {pending ? 'Saving…' : 'Change'}
              </button>
            </div>
          </>
        )}
      </form>
    </div>
  );
}
