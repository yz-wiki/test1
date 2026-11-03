// Unified titlebar — macOS "toolbar" geometry.
//
// The window is undecorated (see src-tauri/src/lib.rs), so everything the OS
// would normally draw lives here: traffic lights, the drag region, and the eight
// invisible resize handles. Three consumers share it — the main shell, the login
// screen and onboarding — which is why `minimal` exists (chrome-only, no status
// pills, no toolbar actions).
import type { CSSProperties, ReactNode } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import TrafficLights from '../shell/TrafficLights';
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

      <TrafficLights />

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0, marginLeft: 6 }}>
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
        <span className="mac-badge mac-badge--warn" title={lastRefresh ? formatDateTime(lastRefresh) : undefined}>
          {t('window.offlinePill')}
          {lastRefresh ? ` · ${t('window.refreshedAt', { when: formatDateTime(lastRefresh) })}` : ''}
        </span>
      )}

      {!minimal && isUnencrypted && (
        <span className="mac-badge mac-badge--warn" title={t('window.unencryptedHint')}>
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
            className="mac-iconbtn"
            onClick={onOpenPalette}
            title={t('palette.action.commandPalette')}
            aria-label={t('palette.action.commandPalette')}
            data-tauri-drag-region="false"
            style={{ width: 'auto', padding: '0 8px', gap: 6, display: 'inline-flex' }}
          >
            <Icon name="search" size={13} />
            {paletteShortcut && <span className="mac-kbd">{paletteShortcut}</span>}
          </button>
        )}
        {!minimal && onToggleSidebar && (
          <button
            type="button"
            className="mac-iconbtn"
            onClick={onToggleSidebar}
            title={sidebarVisible ? t('nav.collapseSidebar') : t('nav.expandSidebar')}
            aria-label={sidebarVisible ? t('nav.collapseSidebar') : t('nav.expandSidebar')}
            aria-pressed={sidebarVisible}
            data-tauri-drag-region="false"
          >
            <Icon name="list" size={14} />
          </button>
        )}
      </div>
    </header>
  );
}
