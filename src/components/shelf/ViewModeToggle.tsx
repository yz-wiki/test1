import Icon from '../Icon';
import type { OnyxState } from '../../state/onyx';

// One family for interface text; monospace is opt-in via .ui-tech.
const UI_STACK = 'var(--font-ui)';

const MONO = UI_STACK;

export interface ViewModeToggleProps {
  st: OnyxState;
}

const MODES = [
  { id: 'grid', icon: 'grid', label: 'Grid' },
  { id: 'list', icon: 'list', label: 'List' },
] as const;

export default function ViewModeToggle({ st }: ViewModeToggleProps) {
  return (
    <div style={{
      display: 'flex', padding: 'var(--s-1)', gap: 'var(--s-1)',
      background: 'var(--onyx-glass)', border: '1px solid var(--onyx-glass-edge)', borderRadius: 'var(--r-md)',
    }}>
      {MODES.map(m => {
        const active = st.libraryView === m.id;
        return (
          <button key={m.id} onClick={() => st.setLibraryView(m.id)} title={`${m.label} view`} style={{
            display: 'flex', alignItems: 'center', gap: 'var(--s-2)',
            padding: 'var(--s-2) var(--s-3)', borderRadius: 'var(--r-sm)', cursor: 'pointer',
            background: active ? 'var(--onyx-accent-dim)' : 'transparent',
            border: 'none',
            color: active ? 'var(--onyx-accent)' : 'var(--onyx-text-dim)',
            fontFamily: MONO, fontSize: 'var(--fs-0)', letterSpacing: '0.06em', textTransform: 'uppercase',
            fontWeight: active ? 600 : 400,
          }}>
            <Icon name={m.icon} size={13} />
            {m.label}
          </button>
        );
      })}
    </div>
  );
}
