// Primary navigation rail.
//
// This replaces the "everything in a top bar" model with the macOS
// source-list pattern: a persistent translucent sidebar on the left, grouped
// sections with quiet uppercase headers, a leading glyph + optional count badge
// per row, and the account pinned to the bottom.
//
// Two responsibilities moved here out of TopNav:
//   1. library switching (the old accent "Library" chip),
//   2. the account/settings entry point (the old avatar button).
// TopNav hides both when it detects a sidebar through ShellChromeContext, so the
// compact layout still works exactly as before for users who collapse the rail.
import { useEffect, useMemo, useRef, useState } from 'react';
import type { OnyxState } from '../../state/onyx';
import Icon from '../Icon';
import type { IconName } from '../Icon';
import { useI18n } from '../../i18n';
import { libraryDisplayLabel, librarySourceBadge } from '../../lib/libraryPresentation';
import { allLibrariesShelf } from '../../lib/allLibraries';
import { log } from '../../lib/log';

export interface SidebarProps {
  st: OnyxState;
  compact: boolean;
  onNavigate?: () => void;
}

type NavState = 'idle' | 'active' | 'disabled';

interface NavRow {
  id: string;
  label: string;
  icon: IconName;
  state: NavState;
  badge?: string;
  onSelect: () => void;
}

interface NavSection {
  id: string;
  label: string;
  rows: NavRow[];
}

export default function Sidebar({ st, compact, onNavigate }: SidebarProps) {
  const { t } = useI18n();
  const [switcherOpen, setSwitcherOpen] = useState(false);
  const switcherRef = useRef<HTMLDivElement>(null);

  const active = st.activeLibrary;
  const isPodcastLibrary = active?.mediaType === 'podcast';
  const podcastLibrary = useMemo(
    () => st.libraries.find(library => library.mediaType === 'podcast'),
    [st.libraries],
  );

  const libraryChoices = useMemo(() => {
    const combined = allLibrariesShelf(st.libraries);
    return combined ? [combined, ...st.libraries] : st.libraries;
  }, [st.libraries]);

  // Close the switcher on any outside click. Escape is handled on the trigger so
  // the focus ring returns to it rather than dropping to <body>.
  useEffect(() => {
    if (!switcherOpen) return;
    const onDown = (event: MouseEvent) => {
      if (switcherRef.current && !switcherRef.current.contains(event.target as Node)) {
        setSwitcherOpen(false);
      }
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [switcherOpen]);

  const go = (fn: () => void) => () => {
    fn();
    setSwitcherOpen(false);
    onNavigate?.();
  };

  const selectShelfTab = (tab: string) => go(() => {
    if (st.screen !== 'library') st.setScreen('library');
    st.setShelfTab(tab);
  });

  const openSettings = (section?: string) => go(() => {
    if (section) st.setSettingsSection(section);
    st.setScreen('settings');
  });

  const switchLibrary = (id: string) => go(() => {
    if (id !== st.currentLibraryId) {
      st.setActiveLibrary(id).catch((error: unknown) => {
        log.error('library', 'sidebar library switch failed', { id, err: String(error) });
      });
    }
    st.setScreen('library');
    st.setContextFilter(null);
  });

  const shelfActive = (tab: string) => st.screen === 'library' && st.shelfTab === tab;

  const sections: NavSection[] = [];

  // ── Book library tabs ──────────────────────────────────────────────────────
  if (active && !isPodcastLibrary) {
    const rows: NavRow[] = [
      { id: 'home', label: t('nav.home'), icon: 'home', state: shelfActive('library') ? 'active' : 'idle', onSelect: selectShelfTab('library') },
      { id: 'recently-added', label: t('nav.recentlyAdded'), icon: 'clock', state: shelfActive('recently-added') ? 'active' : 'idle', onSelect: selectShelfTab('recently-added') },
      { id: 'series', label: t('nav.series'), icon: 'layers', state: shelfActive('series') ? 'active' : 'idle', onSelect: selectShelfTab('series') },
      { id: 'authors', label: t('nav.authors'), icon: 'edit', state: shelfActive('authors') ? 'active' : 'idle', onSelect: selectShelfTab('authors') },
    ];

    // Collections / Playlists are server-scoped; hide them for local-only
    // libraries instead of showing a row that would bounce back to Home.
    const source = active.source;
    if (source !== 'local' && st.optionalTabs?.collections !== false) {
      rows.push({ id: 'collections', label: t('nav.collections'), icon: 'grid', state: shelfActive('collections') ? 'active' : 'idle', onSelect: selectShelfTab('collections') });
    }

    sections.push({ id: 'library', label: t('nav.section.library'), rows });
  }

  // ── Podcasts ───────────────────────────────────────────────────────────────
  if (podcastLibrary) {
    sections.push({
      id: 'podcasts',
      label: t('nav.section.collections'),
      rows: [{
        id: 'podcasts',
        label: t('nav.podcasts'),
        icon: 'cast',
        state: isPodcastLibrary && st.screen === 'library' ? 'active' : 'idle',
        onSelect: () => switchLibrary(podcastLibrary.id),
      }],
    });
  }

  // ── Device-level destinations ──────────────────────────────────────────────
  // Rendered in the footer, directly above the account card: these are
  // destinations you reach for constantly, so they should not scroll away with
  // the library list.
  const downloadCount = st.downloads.length;
  const footerRows: NavRow[] = [
      {
        id: 'now-playing',
        label: t('nav.nowPlaying'),
        icon: 'headphones',
        // Without a loaded book there is nothing for the Player screen to show,
        // so the row is disabled rather than opening an empty transport.
        state: st.screen === 'player' ? 'active' : st.currentBookId ? 'idle' : 'disabled',
        onSelect: go(() => st.setScreen('player')),
      },
      {
        id: 'downloads',
        label: t('nav.downloads'),
        icon: 'download',
        state: st.screen === 'settings' && st.settingsSection === 'downloads' ? 'active' : 'idle',
        badge: downloadCount > 0 ? String(downloadCount) : undefined,
        onSelect: openSettings('downloads'),
      },
      {
        id: 'settings',
        label: t('nav.settings'),
        icon: 'sliders',
        state: st.screen === 'settings' && st.settingsSection !== 'downloads' ? 'active' : 'idle',
        onSelect: openSettings(),
      },
  ];

  const displayName = st.user?.username || st.localDisplayName || t('misc.reader');
  const role = st.isAdmin ? 'Admin' : st.localMode ? t('misc.local') : 'User';

  return (
    <aside className={`mac-sidebar${compact ? ' mac-sidebar--compact' : ''}`} aria-label={t('nav.section.library')}>
      {/* Library switcher — the macOS "source list header" slot. */}
      <div ref={switcherRef} style={{ position: 'relative', marginBottom: 10, flex: '0 0 auto' }}>
        <button
          type="button"
          className="mac-account"
          onClick={() => {
            if (libraryChoices.length > 1) setSwitcherOpen(open => !open);
            else openSettings('library');
          }}
          onKeyDown={(event) => {
            if (event.key === 'Escape' && switcherOpen) {
              event.preventDefault();
              setSwitcherOpen(false);
            }
          }}
          aria-haspopup={libraryChoices.length > 1 ? 'listbox' : undefined}
          aria-expanded={libraryChoices.length > 1 ? switcherOpen : undefined}
          title={libraryChoices.length > 1 ? t('nav.switchLibrary') : t('nav.libraries')}
          style={{ padding: '7px 8px' }}
        >
          <span
            className="mac-avatar"
            style={{
              background: 'var(--onyx-accent-dim)',
              color: 'var(--onyx-accent)',
              borderRadius: 7,
              width: 26,
              height: 26,
            }}
          >
            <Icon name="layers" size={14} />
          </span>
          <span className="mac-sidebar__footer-meta" style={{ flex: '1 1 auto' }}>
            <span className="mac-sidebar__footer-name" style={{ display: 'block' }}>
              {active ? libraryDisplayLabel(active) : t('misc.noLibrary')}
            </span>
            <span className="mac-sidebar__footer-role">{active ? librarySourceBadge(active) : t('nav.libraries')}</span>
          </span>
          {libraryChoices.length > 1 && !compact && (
            <span style={{ display: 'inline-flex', color: 'var(--onyx-text-mute)', transform: switcherOpen ? 'rotate(180deg)' : 'none', transition: 'transform 150ms var(--mac-ease)' }}>
              <Icon name="chevron-down" size={11} />
            </span>
          )}
        </button>

        {switcherOpen && (
          <div
            role="listbox"
            aria-label={t('nav.switchLibrary')}
            className="mac-panel"
            style={{
              position: 'absolute',
              top: '100%',
              left: 0,
              right: 0,
              marginTop: 6,
              zIndex: 200,
              padding: 5,
              maxHeight: 320,
              overflowY: 'auto',
              background: 'var(--mac-panel-bg-strong)',
            }}
          >
            {libraryChoices.map((library) => {
              const isActive = library.id === st.currentLibraryId;
              return (
                <button
                  key={library.id}
                  role="option"
                  aria-selected={isActive}
                  onClick={() => switchLibrary(library.id)}
                  className="mac-nav-item"
                  style={isActive ? { background: 'var(--mac-active)', fontWeight: 600 } : undefined}
                >
                  <span className="mac-nav-item__label">{libraryDisplayLabel(library)}</span>
                  <span className="mac-nav-item__badge" style={{ background: 'transparent', padding: 0 }}>
                    {librarySourceBadge(library)}
                  </span>
                  {isActive && <Icon name="check" size={12} color="var(--onyx-accent)" />}
                </button>
              );
            })}
          </div>
        )}
      </div>

      <div className="mac-sidebar__scroll mac-scroll">
        {sections.map(section => (
          <div key={section.id} className="mac-sidebar__section">
            <div className="mac-sidebar__label">{section.label}</div>
            {section.rows.map(row => (
              <button
                key={row.id}
                type="button"
                className={`mac-nav-item${row.state === 'active' ? ' mac-nav-item--active' : ''}`}
                aria-current={row.state === 'active' ? 'page' : undefined}
                disabled={row.state === 'disabled'}
                onClick={row.onSelect}
                title={compact ? row.label : undefined}
                style={row.state === 'disabled' ? { opacity: 0.4, pointerEvents: 'none' } : undefined}
              >
                <span className="mac-nav-item__icon"><Icon name={row.icon} size={15} /></span>
                <span className="mac-nav-item__label">{row.label}</span>
                {row.badge && <span className="mac-nav-item__badge">{row.badge}</span>}
              </button>
            ))}
          </div>
        ))}
      </div>

      <div className="mac-sidebar__footer">
        {footerRows.map(row => (
          <button
            key={row.id}
            type="button"
            className={`mac-nav-item${row.state === 'active' ? ' mac-nav-item--active' : ''}`}
            aria-current={row.state === 'active' ? 'page' : undefined}
            disabled={row.state === 'disabled'}
            onClick={row.onSelect}
            title={compact ? row.label : undefined}
            style={row.state === 'disabled' ? { opacity: 0.4, pointerEvents: 'none' } : undefined}
          >
            <span className="mac-nav-item__icon"><Icon name={row.icon} size={15} /></span>
            <span className="mac-nav-item__label">{row.label}</span>
            {row.badge && <span className="mac-nav-item__badge">{row.badge}</span>}
          </button>
        ))}
        <div className="mac-hairline" style={{ margin: '6px 8px' }} />
        <button
          type="button"
          className="mac-account"
          onClick={openSettings('account')}
          title={t('nav.account')}
        >
          <span className="mac-avatar">{displayName[0]?.toUpperCase() ?? '?'}</span>
          <span className="mac-sidebar__footer-meta">
            <span className="mac-sidebar__footer-name">{displayName}</span>
            <span className="mac-sidebar__footer-role">{role}</span>
          </span>
        </button>
      </div>
    </aside>
  );
}
