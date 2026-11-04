import { useState, useEffect } from 'react';
import { registerShortcuts } from '../../api/abs';
import type { ShortcutBinding } from '../../api/abs';
import { DEFAULT_SHORTCUTS } from '../../hooks/useGlobalShortcuts';
import { SectionHead, MONO, SERIF, Panel } from './shared';
import { log } from '../../lib/log';
import type { ShortcutFailure } from '../../api/abs';
import { useI18n } from '../../i18n';

const ACTION_LABELS: Record<string, string> = {
  play_pause:   'Play / Pause',
  skip_forward: 'Skip Forward',
  skip_back:    'Skip Back',
  volume_up:    'Volume Up',
  volume_down:  'Volume Down',
  mute:         'Mute',
};

function loadBindings(): ShortcutBinding[] {
  try {
    const raw = localStorage.getItem('onyx.shortcuts');
    if (raw) return JSON.parse(raw) as ShortcutBinding[];
  } catch { /* fall through */ }
  return DEFAULT_SHORTCUTS;
}

function keyCodeToName(code: string): string {
  const map: Record<string, string> = {
    ArrowLeft: 'Left', ArrowRight: 'Right',
    ArrowUp: 'Up', ArrowDown: 'Down',
    Space: 'Space',
  };
  if (map[code]) return map[code];
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  return code;
}

function buildShortcutString(e: KeyboardEvent): string | null {
  if (['Control', 'Alt', 'Shift', 'Meta'].includes(e.key)) return null;
  const parts: string[] = [];
  if (e.ctrlKey)  parts.push('Ctrl');
  if (e.altKey)   parts.push('Alt');
  if (e.shiftKey) parts.push('Shift');
  if (e.metaKey)  parts.push('Meta');
  parts.push(keyCodeToName(e.code));
  return parts.join('+');
}

// Display-only key glyphs (the stored binding string keeps the textual names).
const KEY_GLYPHS: Record<string, string> = { Left: '←', Right: '→', Up: '↑', Down: '↓' };
const displayKey = (part: string): string => KEY_GLYPHS[part] ?? part;

// Base keycap; modifiers render neutral, the final (main) key renders accent gold.
const keycapBase: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  minWidth: 24, padding: 'var(--s-1) var(--s-3)', borderRadius: 'var(--r-sm)', lineHeight: 1,
  fontFamily: MONO, fontSize: 'var(--fs-1)', userSelect: 'none',
};
const modCap: React.CSSProperties = {
  ...keycapBase, background: 'var(--onyx-glass)', border: '1px solid var(--onyx-glass-edge)',
  boxShadow: '0 1px 0 var(--onyx-glass-edge)', color: 'var(--onyx-text-dim)',
};
const mainCap: React.CSSProperties = {
  ...keycapBase, background: 'var(--onyx-accent-dim)', border: '1px solid var(--onyx-accent-edge)',
  boxShadow: '0 1px 0 rgba(0,0,0,0.3)', color: 'var(--onyx-accent)',
};

function ShortcutChord({ shortcut, active }: { shortcut: string; active: boolean }) {
  const { t } = useI18n();
  if (active) {
    return (
      <span style={{ fontFamily: MONO, fontSize: 'var(--fs-1)', color: 'var(--onyx-accent)', letterSpacing: '0.06em' }}>
        {t('kbdMod.pressCombo')}
      </span>
    );
  }
  const parts = shortcut.split('+');
  return (
    <span style={{ display: 'inline-flex', gap: 'var(--s-2)', alignItems: 'center' }}>
      {parts.map((p, i) => {
        const isLast = i === parts.length - 1;
        return (
          <span key={i} style={{ display: 'inline-flex', gap: 'var(--s-2)', alignItems: 'center' }}>
            {i > 0 && <span style={{ fontFamily: MONO, fontSize: 'var(--fs-0)', color: 'var(--onyx-text-mute)' }}>+</span>}
            <kbd style={isLast ? mainCap : modCap}>{displayKey(p)}</kbd>
          </span>
        );
      })}
    </span>
  );
}

export default function KeyboardSection() {
  const { t } = useI18n();
  // Bindings the OS refused (another app already owns the combination). Shown as
  // an inline notice so the user can remap right here instead of hunting the log.
  const [conflicts, setConflicts] = useState<ShortcutFailure[]>([]);
  const [bindings, setBindings] = useState<ShortcutBinding[]>(loadBindings);
  const [listeningFor, setListeningFor] = useState<string | null>(null);
  const [secondsRemaining, setSecondsRemaining] = useState(0);

  useEffect(() => {
    if (!listeningFor) { setSecondsRemaining(0); return; }
    setSecondsRemaining(5);
    const timer = window.setInterval(() => setSecondsRemaining(s => {
      if (s <= 1) { setListeningFor(null); return 0; }
      return s - 1;
    }), 1000);
    return () => window.clearInterval(timer);
  }, [listeningFor]);

  useEffect(() => {
    if (!listeningFor) return;

    const onKeyDown = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();

      if (e.key === 'Escape') {
        setListeningFor(null);
        return;
      }

      const shortcut = buildShortcutString(e);
      if (!shortcut) return;

      const newBindings = bindings.map(b =>
        b.action === listeningFor ? { ...b, shortcut } : b,
      );
      setBindings(newBindings);
      localStorage.setItem('onyx.shortcuts', JSON.stringify(newBindings));
      registerShortcuts(newBindings)
        .then(failures => setConflicts(failures ?? []))
        .catch(e => { setConflicts([]); log.error('playback', 'register shortcuts failed', { err: String(e) }); });
      setListeningFor(null);
    };

    window.addEventListener('keydown', onKeyDown, { capture: true });
    return () => window.removeEventListener('keydown', onKeyDown, { capture: true });
  }, [listeningFor, bindings]);

  function resetDefaults() {
    setBindings(DEFAULT_SHORTCUTS);
    localStorage.setItem('onyx.shortcuts', JSON.stringify(DEFAULT_SHORTCUTS));
    registerShortcuts(DEFAULT_SHORTCUTS)
      .then(failures => setConflicts(failures ?? []))
      .catch(e => { setConflicts([]); log.error('playback', 'reset shortcuts to defaults failed', { err: String(e) }); });
    setListeningFor(null);
  }

  return (
    <div>
      <SectionHead title={t('kbdMod.title')} subtitle="Global shortcuts — work even when Skald is in the background." />

      <Panel label={t('kbdMod.globalShortcuts')}>
        {conflicts.length > 0 && (
          <div style={{
            display: 'flex', gap: 'var(--s-2)', margin: 'var(--s-3) 0 var(--s-1)', padding: 'var(--s-2) var(--s-3)',
            borderRadius: 'var(--r-md)', border: '1px solid rgba(212,131,74,0.4)',
            background: 'rgba(212,131,74,0.08)', color: '#d4834a',
            fontSize: 'var(--fs-2)', lineHeight: 1.5,
          }}>
            <span style={{ flexShrink: 0 }}>!</span>
            <span>
              {t('keyboard.conflictBody', { shortcuts: conflicts.map(c => c.shortcut).join(', ') })}
            </span>
          </div>
        )}
        {bindings.map(b => {
          const isListening = listeningFor === b.action;
          return (
            <div
              key={b.action}
              onClick={() => setListeningFor(isListening ? null : b.action)}
              title={isListening ? 'Press Escape to cancel' : 'Click to remap'}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--s-4)',
                cursor: 'pointer', transition: 'background 0.1s',
                borderBottom: '1px solid var(--onyx-line)',
                // When listening, the accent highlight extends slightly into the panel
                // padding (negative margin offsets the extra padding so content stays put).
                ...(isListening
                  ? { background: 'var(--onyx-accent-dim)', borderRadius: 'var(--r-md)', borderBottomColor: 'transparent', padding: 'var(--s-4) var(--s-3)', margin: '0 -12px' }
                  : { padding: 'var(--s-4) var(--s-1)' }),
              }}
            >
              <span style={{ fontFamily: SERIF, fontSize: 'var(--fs-4)', color: 'var(--onyx-text)' }}>
                {ACTION_LABELS[b.action] ?? b.action}
              </span>
              <ShortcutChord shortcut={b.shortcut} active={isListening} />
              {isListening && <span style={{ fontFamily: MONO, fontSize: 'var(--fs-0)', color: 'var(--onyx-accent)' }}>Press a key · {secondsRemaining}s</span>}
            </div>
          );
        })}

        {/* Footer: system-wide note + reset */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--s-4)', padding: 'var(--s-4) var(--s-1) var(--s-2)' }}>
          <span style={{ fontSize: 'var(--fs-2)', color: 'var(--onyx-text-mute)', lineHeight: 1.4 }}>
            {t('kbdMod.globalShortcutsHint')}
          </span>
          <button
            onClick={resetDefaults}
            style={{
              flexShrink: 0,
              padding: 'var(--s-2) var(--s-4)',
              background: 'transparent',
              border: '1px solid var(--onyx-glass-edge)',
              borderRadius: 'var(--r-sm)',
              color: 'var(--onyx-text-dim)',
              cursor: 'pointer',
              fontFamily: MONO,
              fontSize: 'var(--fs-0)',
              letterSpacing: '0.08em',
              textTransform: 'uppercase' as const,
            }}
          >
            {t('kbdMod.resetDefaults')}
          </button>
        </div>
      </Panel>
    </div>
  );
}
