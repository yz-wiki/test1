/**
 * Settings pane primitives.
 *
 * These are thin wrappers over src/ui so every one of the thirteen Settings
 * panes shares a single visual language. They exist only to keep the pane code
 * terse — the actual geometry, type and colour live in src/styles/system.css.
 *
 * Typography note: there is no serif and no monospace here. Earlier versions
 * exported SERIF / MONO / eyebrowStyle and panes used them for headings and
 * labels, which is exactly the inconsistency this refactor removes. The two
 * remaining exports are kept as aliases so any straggler compiles, but they now
 * resolve to the interface font.
 */
import { useState, useCallback, createContext, useContext, type ReactNode, type CSSProperties } from 'react';
import { Card, SettingsRow, Switch, Input, Segmented, Button } from '../../ui';

// One family for interface text; monospace is opt-in via .ui-tech.
const UI_STACK = 'var(--font-ui)';

/** Interface type stack — the only family allowed in settings copy. */
export const UI_FONT = 'var(--font-ui)';

/** @deprecated Headings are sans now; kept so older imports still compile. */
export const SERIF = UI_STACK;
/** @deprecated Monospace is reserved for technical values; UI copy uses sans. */
export const MONO = UI_STACK;

/** @deprecated Use <GroupLabel> / .ui-group-label instead. */
export const DIM_GOLD = 'var(--onyx-text-mute)';

/** @deprecated Use <GroupLabel> / .ui-group-label instead. */
export const eyebrowStyle: CSSProperties = {
  fontSize: 'var(--fs-1)',
  fontWeight: 600,
  letterSpacing: '0.045em',
  textTransform: 'uppercase',
  color: 'var(--onyx-text-mute)',
};

export function useLocal<T>(key: string, def: T): [T, (v: T) => void] {
  const [v, setV] = useState<T>(() => {
    const raw = localStorage.getItem(key);
    if (raw === null) return def;
    try { return JSON.parse(raw) as T; } catch { return raw as unknown as T; }
  });
  const set = useCallback((next: T) => {
    setV(next);
    localStorage.setItem(key, JSON.stringify(next));
  }, [key]);
  return [v, set];
}

// ─── Section header ──────────────────────────────────────────────────────────

export interface SectionHeadProps { title: string; subtitle?: string; }

export function SectionHead({ title, subtitle }: SectionHeadProps) {
  return (
    <div style={{ marginBottom: 'var(--s-5)' }}>
      <h1 className="ui-title">{title}</h1>
      {subtitle && (
        <p className="ui-sub" style={{ marginTop: 'var(--s-1)', maxWidth: 580 }}>{subtitle}</p>
      )}
    </div>
  );
}

// ─── Rows ────────────────────────────────────────────────────────────────────

export interface RowProps { label: string; hint?: string; children?: ReactNode; align?: 'center' | 'top'; }

/** One setting: label + hint on the left, control on the right. */
export function Row({ label, hint, children }: RowProps) {
  return <SettingsRow label={label} hint={hint}>{children}</SettingsRow>;
}

// ─── Controls ────────────────────────────────────────────────────────────────

export interface ToggleProps { on: boolean; onChange: (v: boolean) => void; label?: string; }

export function Toggle({ on, onChange, label = 'Toggle' }: ToggleProps) {
  return <Switch checked={on} onChange={onChange} label={label} />;
}

export interface PillProps { active: boolean; onClick: () => void; children?: ReactNode; }

/** A single-choice chip. Renders as a real segmented item so it matches every
 *  other single-choice control in the app. */
export function Pill({ active, onClick, children }: PillProps) {
  return (
    <div className="ui-seg">
      <button type="button" className="ui-seg__item" aria-pressed={active} onClick={onClick}>
        {children}
      </button>
    </div>
  );
}

export interface SegProps { active: boolean; onClick: () => void; children: ReactNode; }

export function Seg({ active, onClick, children }: SegProps) {
  return (
    <button
      type="button"
      aria-pressed={active}
      className="ui-seg__item"
      onClick={onClick}
    >{children}</button>
  );
}

/** Grouping box for a row's segmented buttons. */
export function SegGroup({ children }: { children: ReactNode }) {
  return <div className="ui-seg" role="group" style={{ flexWrap: 'wrap' }}>{children}</div>;
}

export interface TextInputProps {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
  /** Tabular/monospace rendering for paths, URLs and cron expressions only. */
  mono?: boolean;
}

export function TextInput({ value, onChange, placeholder, type = 'text', mono = false }: TextInputProps) {
  return (
    <Input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      tech={mono}
      style={{ minWidth: 260 }}
    />
  );
}

// ─── Panels ──────────────────────────────────────────────────────────────────

/**
 * A titled group of rows. When nested inside another Panel it renders as a
 * flat sub-section (divider + content) so a parent can host several groups on
 * one surface without stacking cards inside cards.
 */
export const PanelFlatContext = createContext(false);

export interface PanelProps {
  label: string;
  action?: ReactNode;
  children: ReactNode;
  style?: CSSProperties;
  bodyStyle?: CSSProperties;
}

export function Panel({ label, action, children, style }: PanelProps) {
  const flat = useContext(PanelFlatContext);

  if (flat) {
    return (
      <div style={{ marginTop: 'var(--s-4)', ...style }}>
        <div
          className="ui-rowline"
          style={{
            justifyContent: 'space-between',
            paddingBottom: 'var(--s-2)',
            borderBottom: '1px solid var(--hairline)',
            marginBottom: 'var(--s-1)',
          }}
        >
          <span className="ui-group-label">{label}</span>
          {action}
        </div>
        {children}
      </div>
    );
  }

  return (
    <Card title={label} actions={action} style={{ marginTop: 'var(--s-5)', ...style }}>
      {children}
    </Card>
  );
}

// ─── Misc ────────────────────────────────────────────────────────────────────

export { Card, Button, Segmented };
