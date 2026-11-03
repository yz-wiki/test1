/**
 * The application's only component vocabulary.
 *
 * Every screen composes these; none of them accepts an arbitrary `style`
 * override. That is the point: if a screen needs a different padding or colour,
 * the design system is what changes, not the screen. It is what keeps 20+ panes
 * looking like one product.
 *
 * Colours, spacing and radii all resolve through CSS classes in
 * src/styles/system.css — see that file for the token definitions.
 */
import type { CSSProperties, ReactNode, ButtonHTMLAttributes, InputHTMLAttributes } from 'react';
import Icon, { type IconName } from '../components/Icon';

// ─── Button ──────────────────────────────────────────────────────────────────

export type ButtonTone = 'default' | 'primary' | 'ghost' | 'danger';
export type ControlSize = 'sm' | 'md' | 'lg';

export interface ButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'className'> {
  tone?: ButtonTone;
  size?: ControlSize;
  icon?: IconName;
  block?: boolean;
}

export function Button({ tone = 'default', size = 'md', icon, block, children, type = 'button', ...rest }: ButtonProps) {
  const cls = [
    'ui-btn',
    tone === 'primary' && 'ui-btn--primary',
    tone === 'ghost' && 'ui-btn--ghost',
    tone === 'danger' && 'ui-btn--danger',
    size === 'sm' && 'ui-btn--sm',
    size === 'lg' && 'ui-btn--lg',
    block && 'ui-btn--block',
  ].filter(Boolean).join(' ');
  return (
    <button type={type} className={cls} {...rest}>
      {icon && <Icon name={icon} size={size === 'sm' ? 13 : 15} />}
      {children}
    </button>
  );
}

// ─── IconButton ──────────────────────────────────────────────────────────────

export interface IconButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'className' | 'children'> {
  icon: IconName;
  label: string;
  active?: boolean;
  size?: 'sm' | 'md';
  iconSize?: number;
}

export function IconButton({ icon, label, active, size = 'md', iconSize = 15, type = 'button', ...rest }: IconButtonProps) {
  return (
    <button
      type={type}
      className={`ui-iconbtn${active ? ' ui-iconbtn--active' : ''}${size === 'sm' ? ' ui-iconbtn--sm' : ''}`}
      aria-label={label}
      title={label}
      aria-pressed={active}
      {...rest}
    >
      <Icon name={icon} size={iconSize} />
    </button>
  );
}

// ─── Form controls ───────────────────────────────────────────────────────────

export interface FieldProps {
  label?: ReactNode;
  hint?: ReactNode;
  children: ReactNode;
  htmlFor?: string;
}

export function Field({ label, hint, children, htmlFor }: FieldProps) {
  return (
    <div className="ui-field">
      {label && <label className="ui-field__label" htmlFor={htmlFor}>{label}</label>}
      {children}
      {hint && <span className="ui-field__hint">{hint}</span>}
    </div>
  );
}

export interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'className' | 'size'> {
  tech?: boolean;
  width?: number | string;
}

export function Input({ tech, width, style, ...rest }: InputProps) {
  return (
    <input
      className={`ui-input${tech ? ' ui-input--tech' : ''}`}
      style={width ? { width, ...style } : style}
      {...rest}
    />
  );
}

export interface SelectProps {
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
  label?: string;
  width?: number | string;
  disabled?: boolean;
}

export function Select({ value, onChange, options, label, width, disabled }: SelectProps) {
  return (
    <select
      className="ui-select"
      aria-label={label}
      title={label}
      value={value}
      disabled={disabled}
      style={width ? { width } : undefined}
      onChange={(event) => onChange(event.target.value)}
    >
      {options.map(option => (
        <option key={option.value} value={option.value}>{option.label}</option>
      ))}
    </select>
  );
}

export interface SwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  disabled?: boolean;
}

export function Switch({ checked, onChange, label, disabled }: SwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      title={label}
      className="ui-switch"
      disabled={disabled}
      onClick={() => onChange(!checked)}
    />
  );
}

// ─── Segmented control ───────────────────────────────────────────────────────

export interface SegmentedProps<T extends string> {
  value: T;
  onChange: (value: T) => void;
  options: { value: T; label: string }[];
  label?: string;
}

export function Segmented<T extends string>({ value, onChange, options, label }: SegmentedProps<T>) {
  return (
    <div className="ui-seg" role="group" aria-label={label}>
      {options.map(option => (
        <button
          key={option.value}
          type="button"
          className="ui-seg__item"
          aria-pressed={option.value === value}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

// ─── Surfaces ────────────────────────────────────────────────────────────────

export interface CardProps {
  children: ReactNode;
  title?: ReactNode;
  actions?: ReactNode;
  padded?: boolean;
  style?: CSSProperties;
}

export function Card({ children, title, actions, padded, style }: CardProps) {
  return (
    <section className="ui-card" style={style}>
      {(title || actions) && (
        <header className="ui-card__head">
          <span className="ui-h3">{title}</span>
          {actions && <div className="ui-rowline">{actions}</div>}
        </header>
      )}
      <div className={padded ? 'ui-card--pad' : 'ui-card__body'}>{children}</div>
    </section>
  );
}

export interface SettingsRowProps {
  label: ReactNode;
  hint?: ReactNode;
  children?: ReactNode;
}

/** Label + optional hint on the left, control on the right. */
export function SettingsRow({ label, hint, children }: SettingsRowProps) {
  return (
    <div className="ui-row">
      <div className="ui-row__main">
        <span className="ui-label">{label}</span>
        {hint && <span className="ui-sub">{hint}</span>}
      </div>
      {children && <div className="ui-row__control">{children}</div>}
    </div>
  );
}

// ─── List ────────────────────────────────────────────────────────────────────

export interface ListItemProps {
  label: ReactNode;
  meta?: ReactNode;
  icon?: IconName;
  active?: boolean;
  selected?: boolean;
  disabled?: boolean;
  onClick?: () => void;
  title?: string;
}

export function ListItem({ label, meta, icon, active, selected, disabled, onClick, title }: ListItemProps) {
  return (
    <button
      type="button"
      className={`ui-list__item${active ? ' ui-list__item--active' : ''}`}
      aria-selected={selected}
      disabled={disabled}
      onClick={onClick}
      title={title}
    >
      {icon && <span className="ui-list__icon"><Icon name={icon} size={14} /></span>}
      <span className="ui-list__label">{label}</span>
      {meta && <span className="ui-list__meta">{meta}</span>}
    </button>
  );
}

export function List({ children }: { children: ReactNode }) {
  return <div className="ui-list" role="listbox">{children}</div>;
}

// ─── Tabs ────────────────────────────────────────────────────────────────────

export interface TabsProps<T extends string> {
  value: T;
  onChange: (value: T) => void;
  tabs: { value: T; label: string }[];
  label?: string;
}

export function Tabs<T extends string>({ value, onChange, tabs, label }: TabsProps<T>) {
  return (
    <div className="ui-tabs" role="tablist" aria-label={label}>
      {tabs.map(tab => (
        <button
          key={tab.value}
          type="button"
          role="tab"
          aria-selected={tab.value === value}
          className="ui-tabs__item"
          onClick={() => onChange(tab.value)}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}

// ─── Badge ───────────────────────────────────────────────────────────────────

export function Badge({ children, tone }: { children: ReactNode; tone?: 'accent' | 'warn' | 'danger' }) {
  return (
    <span className={`ui-badge${tone ? ` ui-badge--${tone}` : ''}`}>{children}</span>
  );
}

// ─── Empty state ─────────────────────────────────────────────────────────────

export function EmptyState({ icon, title, body, action }: {
  icon?: IconName;
  title: ReactNode;
  body?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="ui-empty">
      {icon && <Icon name={icon} size={26} />}
      <div className="ui-empty__title">{title}</div>
      {body && <div className="ui-empty__body">{body}</div>}
      {action}
    </div>
  );
}

// ─── Overlay ─────────────────────────────────────────────────────────────────

export interface SheetProps {
  title: ReactNode;
  onClose?: () => void;
  closeLabel?: string;
  children: ReactNode;
  footer?: ReactNode;
  width?: number;
  headerExtra?: ReactNode;
}

/** Modal shell. One radius, one padding, one close affordance for the app. */
export function Sheet({ title, onClose, closeLabel = 'Close', children, footer, width = 520, headerExtra }: SheetProps) {
  return (
    <div className="ui-scrim" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose?.(); }}>
      <div className="ui-sheet" role="dialog" aria-modal="true" aria-label={typeof title === 'string' ? title : undefined} style={{ width }}>
        <header className="ui-sheet__head">
          <h2 className="ui-sheet__title">{title}</h2>
          <div className="ui-rowline">
            {headerExtra}
            {onClose && <IconButton icon="close" label={closeLabel} onClick={onClose} />}
          </div>
        </header>
        <div className="ui-sheet__body">{children}</div>
        {footer && <footer className="ui-sheet__foot">{footer}</footer>}
      </div>
    </div>
  );
}

// ─── Progress ────────────────────────────────────────────────────────────────

export function Progress({ value, max = 1, style }: { value: number; max?: number; style?: CSSProperties }) {
  const pct = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0;
  return (
    <div className="ui-progress" style={style} role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100}>
      <div className="ui-progress__fill" style={{ width: `${pct}%` }} />
    </div>
  );
}

// ─── Layout helpers ──────────────────────────────────────────────────────────

/** Screen scaffold — identical padding on every screen. */
export function Screen({ children, flush }: { children: ReactNode; flush?: boolean }) {
  return (
    <div className="ui-screen">
      <div className={`ui-screen__body${flush ? ' ui-screen__body--flush' : ''}`}>{children}</div>
    </div>
  );
}

export function Stack({ children, gap = 3, style }: { children: ReactNode; gap?: 1 | 2 | 3 | 4 | 5 | 6; style?: CSSProperties }) {
  return (
    <div className="ui-stack" style={{ gap: `var(--s-${gap})`, ...style }}>{children}</div>
  );
}

export function RowLine({ children, gap = 2, style }: { children: ReactNode; gap?: 1 | 2 | 3 | 4; style?: CSSProperties }) {
  return (
    <div className="ui-rowline" style={{ gap: `var(--s-${gap})`, ...style }}>{children}</div>
  );
}

export function Toolbar({ children }: { children: ReactNode }) {
  return <div className="ui-toolbar">{children}</div>;
}

export function GroupLabel({ children }: { children: ReactNode }) {
  return <div className="ui-group-label">{children}</div>;
}
