import { useEffect, useRef } from 'react';
import { useI18n } from '../../i18n';

// One family for interface text; monospace is opt-in via .ui-tech.
const UI_STACK = 'var(--font-ui)';

export type ToastType = 'success' | 'error' | 'info';

export interface ToastProps {
  message: string;
  type: ToastType;
  onDismiss: () => void;
}

const BORDER_COLOR: Record<ToastType, string> = {
  success: '#52c97a',
  error:   '#e05a5a',
  info:    'var(--onyx-text-dim)',
};

const BG_COLOR: Record<ToastType, string> = {
  success: 'rgba(76,175,80,0.08)',
  error:   'transparent',
  info:    'transparent',
};

const ICON: Record<ToastType, string | null> = {
  success: '✓',
  error:   null,
  info:    null,
};

const MONO = UI_STACK;

export default function Toast({ message, type, onDismiss }: ToastProps) {
  const { t } = useI18n();
  const dismissRef = useRef(onDismiss);
  useEffect(() => { dismissRef.current = onDismiss; });

  useEffect(() => {
    const t = setTimeout(() => dismissRef.current(), 4000);
    return () => clearTimeout(t);
  }, []);

  return (
    <div
      role={type === 'error' ? 'alert' : 'status'}
      aria-live={type === 'error' ? 'assertive' : 'polite'}
      aria-atomic="true"
      style={{
      position: 'fixed',
      bottom: 24,
      right: 24,
      zIndex: 1000,
      display: 'flex',
      alignItems: 'center',
      gap: 'var(--s-3)',
      minWidth: 260,
      maxWidth: 420,
      background: BG_COLOR[type]
        ? `linear-gradient(${BG_COLOR[type]}, ${BG_COLOR[type]}), var(--onyx-panel2)`
        : 'var(--onyx-panel2)',
      backdropFilter: 'blur(20px)',
      WebkitBackdropFilter: 'blur(20px)',
      border: '1px solid var(--onyx-glass-edge)',
      borderLeft: `3px solid ${BORDER_COLOR[type]}`,
      borderRadius: 'var(--r-md)',
      boxShadow: 'var(--shadow-popover)',
      padding: 'var(--s-3) var(--s-3) var(--s-3) var(--s-4)',
      pointerEvents: 'auto',
      }}
    >
      {ICON[type] && (
        <span aria-hidden="true" style={{ fontSize: 'var(--fs-4)', color: BORDER_COLOR[type], flexShrink: 0, lineHeight: 1 }}>
          {ICON[type]}
        </span>
      )}
      <span style={{ flex: 1, fontSize: 'var(--fs-3)', color: 'var(--onyx-text)', lineHeight: 1.4 }}>
        {message}
      </span>
      <button
        onClick={onDismiss}
        aria-label={t('toastUi.dismiss')}
        style={{
          background: 'none',
          border: 'none',
          color: 'var(--onyx-text-mute)',
          cursor: 'pointer',
          fontFamily: MONO,
          fontSize: 'var(--fs-3)',
          lineHeight: 1,
          padding: 'var(--s-1) var(--s-1)',
          flexShrink: 0,
        }}
        title={t('toastUi.dismiss')}
      >
        ✕
      </button>
    </div>
  );
}
