import { useState, useCallback, createContext, useContext, type ReactNode, type CSSProperties } from 'react';

export const SERIF = '"Source Serif 4", "Iowan Old Style", Georgia, serif';
export const MONO = "'JetBrains Mono', ui-monospace, monospace";

// Dimmed accent (gold) — used for panel eyebrows and sub-headers across the
// settings facelift. References the live accent tokens so it follows the theme.
export const DIM_GOLD = 'rgba(var(--onyx-accent-r),var(--onyx-accent-g),var(--onyx-accent-b),0.6)';

// Mono uppercase eyebrow label (panel headers, sub-section headers).
export const eyebrowStyle: CSSProperties = {
  fontFamily: MONO, fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase', color: DIM_GOLD,
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

export interface SectionHeadProps { title: string; subtitle?: string; }
export function SectionHead({ title, subtitle }: SectionHeadProps) {
  return (
    <div style={{ marginBottom: 24 }}>
      <div style={{ fontFamily: 'var(--mac-font-ui)', fontSize: 20, fontWeight: 650, letterSpacing: '-0.015em' }}>{title}</div>
      {subtitle && <div style={{ marginTop: 6, fontSize: 12.5, color: 'var(--onyx-text-dim)', maxWidth: 560, lineHeight: 1.55 }}>{subtitle}</div>}
    </div>
  );
}

export interface RowProps { label: string; hint?: string; children?: ReactNode; align?: 'center' | 'top'; }
export function Row({ label, hint, children, align = 'center' }: RowProps) {
  return (
    <div style={{ display: 'flex', alignItems: align === 'top' ? 'flex-start' : 'center', justifyContent: 'space-between', padding: '14px 0', borderBottom: '1px solid var(--mac-hairline)', gap: 24 }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13.5, color: 'var(--onyx-text)', fontWeight: 500 }}>{label}</div>
        {hint && <div style={{ marginTop: 4, fontSize: 12, color: 'var(--onyx-text-mute)', maxWidth: 480, lineHeight: 1.45 }}>{hint}</div>}
      </div>
      <div style={{ flexShrink: 0 }}>{children}</div>
    </div>
  );
}

export interface ToggleProps { on: boolean; onChange: (v: boolean) => void; }
export function Toggle({ on, onChange }: ToggleProps) {
  // The macOS switch: a track plus a travelling knob, driven entirely by CSS
  // (.mac-switch in src/styles/macos.css) so track colour, knob shadow and the
  // 16px translation stay consistent with every other switch in the app.
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      className="mac-switch"
      onClick={() => onChange(!on)}
    />
  );
}

export interface PillProps { active: boolean; onClick: () => void; children?: ReactNode; }
export function Pill({ active, onClick, children }: PillProps) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: '6px 12px', borderRadius: 999, fontFamily: MONO, fontSize: 11,
        background: active ? 'var(--onyx-accent-dim)' : 'transparent',
        border: `1px solid ${active ? 'var(--onyx-accent-edge)' : 'var(--onyx-glass-edge)'}`,
        color: active ? 'var(--onyx-accent)' : 'var(--onyx-text-dim)',
        fontWeight: active ? 600 : 400, cursor: 'pointer',
      }}
    >{children}</button>
  );
}

// ── Glass panel (settings facelift) ───────────────────────────────────────────
// A bordered glass card with an eyebrow header that can carry a right-aligned
// action/badge. `style` overrides the outer card (width/flex/marginTop — e.g. the
// Appearance two-column layout); `bodyStyle` overrides the body padding.
// When true, nested <Panel>s drop their own glass card and render as a flush
// eyebrow-divider + content instead. This lets a PARENT pane host several
// sub-sections as ONE glass surface — the look the Appearance Theme/Shelf panes
// have, reused to fold the Libraries sub-sections into two single panes. Default
// false, so every existing standalone Panel is unaffected.
export const PanelFlatContext = createContext(false);

export interface PanelProps {
  label: string;
  action?: ReactNode;
  children: ReactNode;
  style?: CSSProperties;
  bodyStyle?: CSSProperties;
}
export function Panel({ label, action, children, style, bodyStyle }: PanelProps) {
  const flat = useContext(PanelFlatContext);
  if (flat) {
    // No glass card — an eyebrow divider + flush content, so it reads as a
    // sub-section of the surrounding pane (cf. Appearance's "Shelf tabs" divider).
    return (
      <div style={{ marginTop: 16, ...style }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '4px 0 8px', borderBottom: '1px solid var(--mac-hairline)' }}>
          <span style={eyebrowStyle}>{label}</span>
          {action}
        </div>
        <div style={{ padding: '2px 0 4px', ...bodyStyle }}>{children}</div>
      </div>
    );
  }
  return (
    <div style={{
      background: 'var(--mac-control-bg)',
      border: '1px solid var(--mac-hairline)',
      borderRadius: 'var(--mac-radius-card)',
      overflow: 'hidden',
      boxSizing: 'border-box',
      marginTop: 20,
      ...style,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '11px 18px', borderBottom: '1px solid var(--mac-hairline)' }}>
        <span style={eyebrowStyle}>{label}</span>
        {action}
      </div>
      <div style={{ padding: '2px 18px 6px', ...bodyStyle }}>{children}</div>
    </div>
  );
}

// ── Segmented control (settings facelift) ─────────────────────────────────────
// Rectangular uppercase mono pill; accent-tinted when active.
export interface SegProps { active: boolean; onClick: () => void; children: ReactNode; }
export function Seg({ active, onClick, children }: SegProps) {
  return (
    <button
      type="button"
      aria-pressed={active}
      className={`mac-segmented__item${active ? ' mac-segmented__item--active' : ''}`}
      onClick={onClick}
    >{children}</button>
  );
}

// Right-aligned wrapping group for a Row's segmented buttons.
export function SegGroup({ children }: { children: ReactNode }) {
  return (
    <div className="mac-segmented" style={{ flexWrap: 'wrap', justifyContent: 'flex-end' }}>
      {children}
    </div>
  );
}

export interface TextInputProps {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
  mono?: boolean;
}
export function TextInput({ value, onChange, placeholder, type = 'text', mono = false }: TextInputProps) {
  return (
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="mac-field"
      style={{
        minWidth: 280,
        fontFamily: mono ? MONO : 'inherit',
      }}
    />
  );
}
