// Unified titlebar — macOS "toolbar" geometry.
//
// The window is undecorated (see src-tauri/src/lib.rs), so everything the OS
// would normally draw lives here: traffic lights, the drag region, and the eight
// invisible resize handles. Three consumers share it — the main shell, the login
// screen and onboarding — which is why `minimal` exists (chrome-only, no status
// pills, no toolbar actions).
import type { CSSProperties, ReactNode } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import Icon from '../Icon';
import { useI18n } from '../../i18n';
import lyreIcon from '../../assets/lyre.png';

export interface TitlebarProps {
  subtitle?: string;
  /** Retained for API compatibility; the label now comes from i18n. */
  isDark?: boolean;
  /** When true, render window chrome only — no status pills, no actions. */
  minimal?: boolean;
  /** Right-aligned slot in the main cluster (e.g. the activity bell). */
  trailing?: ReactNode;
  isOffline?: boolean;
  lastRefresh?: number | null;
  isUnencrypted?: boolean;
  /** Primary label; defaults to the product name. */
  title?: string;
  /** Sidebar toggle. Omit to hide the control (login / onboarding). */
  onToggleSidebar?: () => void;
  sidebarVisible?: boolean;
  /** Command-palette affordance. Omit to hide. */
  onOpenPalette?: () => void;
  paletteShortcut?: string;
  /** "Back" affordance — steps one level up in the navigation history. */
  onBack?: () => void;
  canGoBack?: boolean;
}

type DragStyle = CSSProperties & { WebkitAppRegion?: string };
type ResizeDirection = Parameters<ReturnType<typeof getCurrentWindow>['startResizeDragging']>[0];

const RESIZE_EDGES: Array<{ direction: ResizeDirection; style: CSSProperties }> = [
  { direction: 'North', style: { top: 0, left: 8, right: 8, height: 5, cursor: 'ns-resize' } },
  { direction: 'South', style: { bottom: 0, left: 8, right: 8, height: 5, cursor: 'ns-resize' } },
  { direction: 'West', style: { top: 8, bottom: 8, left: 0, width: 5, cursor: 'ew-resize' } },
  { direction: 'East', style: { top: 8, bottom: 8, right: 0, width: 5, cursor: 'ew-resize' } },
  { direction: 'NorthWest', style: { top: 0, left: 0, width: 10, height: 10, cursor: 'nwse-resize' } },
  { direction: 'NorthEast', style: { top: 0, right: 0, width: 10, height: 10, cursor: 'nesw-resize' } },
  { direction: 'SouthWest', style: { bottom: 0, left: 0, width: 10, height: 10, cursor: 'nesw-resize' } },
  { direction: 'SouthEast', style: { bottom: 0, right: 0, width: 10, height: 10, cursor: 'nwse-resize' } },
];

const NO_DRAG_SELECTOR = 'button, input, textarea, select, a, [data-tauri-drag-region="false"]';

/** Minimise / maximise / close, in the native Windows order and hit size. */
function WindowButton({ kind, label }: { kind: 'min' | 'max' | 'close'; label: string }) {
  const onClick = () => {
    const win = getCurrentWindow();
    if (kind === 'min') void win.minimize().catch(() => {});
    else if (kind === 'max') void win.toggleMaximize().catch(() => {});
    else void win.close().catch(() => {});
  };

  return (
    <button
      type="button"
      className={`mac-winbtn mac-winbtn--${kind}`}
      onClick={onClick}
      title={label}
      aria-label={label}
      data-tauri-drag-region="false"
    >
      {kind === 'min' && <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true"><path d="M1.5 5h7" /></svg>}
      {kind === 'max' && <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true"><rect x="1.6" y="1.6" width="6.8" height="6.8" rx="1" /></svg>}
      {kind === 'close' && <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true"><path d="M1.8 1.8l6.4 6.4M8.2 1.8L1.8 8.2" /></svg>}
    </button>
  );
}

export default function Titlebar({
  subtitle,
  minimal,
  trailing,
  isOffline,
  lastRefresh,
  isUnencrypted,
  title,
  onToggleSidebar,
  sidebarVisible,
  onOpenPalette,
  paletteShortcut,
  onBack,
  canGoBack,
}: TitlebarProps) {
  const { t, formatDateTime } = useI18n();
  const drag: DragStyle = { WebkitAppRegion: 'drag' };

  const handleMouseDown = (event: React.MouseEvent) => {
    if (event.button !== 0) return;
    const target = event.target as Element;
    if (target.closest(NO_DRAG_SELECTOR)) return;
    // WebKitGTK does not reliably honour CSS/data drag regions for undecorated
    // windows, so start the compositor move explicitly on every platform.
    void getCurrentWindow().startDragging().catch(() => {});
  };

  const handleDoubleClick = (event: React.MouseEvent) => {
    const target = event.target as Element;
    if (target.closest(NO_DRAG_SELECTOR)) return;
    void getCurrentWindow().toggleMaximize().catch(() => {});
  };

  const primary = title ?? 'Skald';
  const secondary = minimal
    ? undefined
    : subtitle ?? (isOffline ? t('common.offline') : undefined);

  return (
    <header
      className="mac-titlebar mac-titlebar__drag"
      style={drag}
      data-tauri-drag-region
      onMouseDown={handleMouseDown}
      onDoubleClick={handleDoubleClick}
    >
      {RESIZE_EDGES.map(({ direction, style }) => (
        <div
          key={direction}
          aria-hidden="true"
          data-tauri-drag-region="false"
          onMouseDown={(event) => {
            if (event.button !== 0) return;
            event.preventDefault();
            event.stopPropagation();
            void getCurrentWindow().startResizeDragging(direction).catch(() => {});
          }}
          style={{ position: 'fixed', zIndex: 1000, ...style }}
        />
      ))}

      {onBack && (
        <button
          type="button"
          className="ui-iconbtn"
          onClick={onBack}
          disabled={!canGoBack}
          title={t('nav.back')}
          aria-label={t('nav.back')}
          data-tauri-drag-region="false"
          style={{ opacity: canGoBack ? 1 : 0.35 }}
        >
          <Icon name="chevron-left" size={16} />
        </button>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0, marginLeft: onBack ? 2 : 6 }}>
        <img
          src={lyreIcon}
          alt=""
          aria-hidden="true"
          style={{ width: 18, height: 18, objectFit: 'contain', filter: 'brightness(1.08)', flex: '0 0 auto' }}
        />
        <div className="mac-titlebar__title">
          <span className="mac-titlebar__title-main">{primary}</span>
          {secondary && <span className="mac-titlebar__title-sub">{secondary}</span>}
        </div>
      </div>

      {!minimal && isOffline && (
        <span className="ui-badge ui-badge--warn" title={lastRefresh ? formatDateTime(lastRefresh) : undefined}>
          {t('window.offlinePill')}
          {lastRefresh ? ` · ${t('window.refreshedAt', { when: formatDateTime(lastRefresh) })}` : ''}
        </span>
      )}

      {!minimal && isUnencrypted && (
        <span className="ui-badge ui-badge--warn" title={t('window.unencryptedHint')}>
          {t('window.unencryptedPill')}
        </span>
      )}

      {/* Centre stays empty: a toolbar that balances left/right clusters reads as
          native, whereas a centred title fights the traffic lights for attention. */}
      <div className="mac-titlebar__center" data-tauri-drag-region />

      <div className="mac-titlebar__right">
        {!minimal && trailing}
        {!minimal && onOpenPalette && (
          <button
            type="button"
            className="ui-iconbtn"
            onClick={onOpenPalette}
            title={t('palette.action.commandPalette')}
            aria-label={t('palette.action.commandPalette')}
            data-tauri-drag-region="false"
            style={{ width: 'auto', padding: '0 8px', gap: 6, display: 'inline-flex' }}
          >
            <Icon name="search" size={13} />
            {paletteShortcut && <span className="ui-kbd">{paletteShortcut}</span>}
          </button>
        )}
        {!minimal && onToggleSidebar && (
          <button
            type="button"
            className="ui-iconbtn"
            onClick={onToggleSidebar}
            title={sidebarVisible ? t('nav.collapseSidebar') : t('nav.expandSidebar')}
            aria-label={sidebarVisible ? t('nav.collapseSidebar') : t('nav.expandSidebar')}
            aria-pressed={sidebarVisible}
            data-tauri-drag-region="false"
          >
            <Icon name="panel-left" size={15} />
          </button>
        )}

        {/* Native-style window controls. The macOS traffic lights were the wrong
            idiom for a Windows/Linux app: keep them where users expect them, with
            the standard hover affordances (red close). */}
        <div style={{ display: 'flex', marginLeft: 4, marginRight: -16, height: '100%' }}>
          <WindowButton kind="min" label={t('window.minimize')} />
          <WindowButton kind="max" label={t('window.maximize')} />
          <WindowButton kind="close" label={t('window.close')} />
        </div>
      </div>
    </header>
  );
}
