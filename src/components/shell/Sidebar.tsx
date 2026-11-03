// Primary navigation rail.
//
// A source list: grouped sections of `ui-list__item` rows, the current library
// pinned at the top as a switcher, and the account pinned at the bottom. The
// rail is never hidden — collapsing it narrows it to an icon rail, because it
// owns two things you cannot reach anywhere else: library switching and the
// account entry point.
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

    // Collections are server-scoped; hide them for local-only libraries instead
    // of showing a row that would bounce back to Home.
    if (active.source !== 'local' && st.optionalTabs?.collections !== false) {
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
  // In the footer, above the account: reached constantly, so they must not
  // scroll away with the library list.
  const downloadCount = st.downloads.length;
  const footerRows: NavRow[] = [
    {
      id: 'now-playing',
      label: t('nav.nowPlaying'),
      icon: 'headphones',
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
  const role = st.isAdmin ? t('nav.roleAdmin') : st.localMode ? t('misc.local') : t('nav.roleUser');

  const renderRow = (row: NavRow) => {
    const activeRow = row.state === 'active';
    return (
      <button
        key={row.id}
        type="button"
        className={`ui-list__item${activeRow ? ' ui-list__item--active' : ''}`}
        aria-current={activeRow ? 'page' : undefined}
        disabled={row.state === 'disabled'}
        onClick={row.onSelect}
        title={compact ? row.label : undefined}
      >
        <span className="ui-list__icon" style={activeRow ? { color: 'var(--onyx-accent)' } : undefined}>
          <Icon name={row.icon} size={15} />
        </span>
        <span className="ui-list__label">{row.label}</span>
        {row.badge && <span className="ui-list__meta">{row.badge}</span>}
      </button>
    );
  };

  return (
    <aside
      className={`ui-sidebar${compact ? ' ui-sidebar--compact' : ''}`}
      aria-label={t('nav.section.library')}
    >
      {/* Library switcher — the rail's headline control. */}
      <div ref={switcherRef} className="ui-sidebar__header" style={{ position: 'relative' }}>
        <button
          type="button"
          className="ui-sidebar__switch"
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
        >
          <span className="ui-sidebar__switch-mark"><Icon name="layers" size={14} /></span>
          <span className="ui-sidebar__switch-text">
            <span className="ui-sidebar__switch-name">
              {active ? libraryDisplayLabel(active) : t('misc.noLibrary')}
            </span>
            <span className="ui-sidebar__switch-sub">
              {active ? librarySourceBadge(active) : t('nav.libraries')}
            </span>
          </span>
          {libraryChoices.length > 1 && !compact && (
            <span style={{ display: 'inline-flex', color: 'var(--onyx-text-mute)', transform: switcherOpen ? 'rotate(180deg)' : 'none', transition: 'transform var(--dur-fast) var(--ease)' }}>
              <Icon name="chevron-down" size={11} />
            </span>
          )}
        </button>

        {switcherOpen && (
          <div
            role="listbox"
            aria-label={t('nav.switchLibrary')}
            className="ui-popover"
            style={{ position: 'absolute', top: '100%', left: 0, right: 0, marginTop: 'var(--s-1)', zIndex: 200 }}
          >
            {libraryChoices.map((library) => {
              const isActive = library.id === st.currentLibraryId;
              return (
                <button
                  key={library.id}
                  type="button"
                  role="option"
                  aria-selected={isActive}
                  onClick={() => switchLibrary(library.id)}
                  className={`ui-list__item${isActive ? ' ui-list__item--active' : ''}`}
                >
                  <span className="ui-list__label">{libraryDisplayLabel(library)}</span>
                  <span className="ui-list__meta">{librarySourceBadge(library)}</span>
                  {isActive && <Icon name="check" size={12} color="var(--onyx-accent)" />}
                </button>
              );
            })}
          </div>
        )}
      </div>

      <div className="ui-sidebar__scroll ui-scroll">
        {sections.map(section => (
          <div key={section.id} className="ui-sidebar__section">
            <div className="ui-sidebar__label"><span className="ui-group-label">{section.label}</span></div>
            {section.rows.map(renderRow)}
          </div>
        ))}
      </div>

      <div className="ui-sidebar__footer">
        {footerRows.map(renderRow)}
        <button
          type="button"
          className="ui-sidebar__account"
          onClick={openSettings('account')}
          title={t('nav.account')}
        >
          <span className="ui-sidebar__avatar">{displayName[0]?.toUpperCase() ?? '?'}</span>
          <span className="ui-sidebar__switch-text ui-sidebar__account-text">
            <span className="ui-sidebar__switch-name">{displayName}</span>
            <span className="ui-sidebar__switch-sub">{role}</span>
          </span>
        </button>
      </div>
    </aside>
  );
}
