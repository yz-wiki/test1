import { useState, useEffect } from 'react';
import type { OnyxState } from '../state/onyx';
import { logout } from '../api/abs';
import Icon from '../components/Icon';
import type { IconName } from '../components/Icon';
import { matchesSettingsSearch } from '../lib/settingsSearch';
import { useI18n, type TranslationKey } from '../i18n';
import {
  AccountSection,
  ServerSection,
  PlaybackSection,
  AudioSection,
  LibraryManagementSection,
  DownloadsSection,
  AppearanceSection,
  KeyboardSection,
  LanguageSection,
  AboutSection,
  NotificationsSection,
  BackupSection,
  ScheduledTasksSection,
  LogsSection,
  SharingSection,
} from '../components/settings';

export interface SettingsProps { st: OnyxState; onLogout: () => void; }

type SectionId =
  | 'account' | 'server' | 'notifications' | 'backups' | 'scheduled-tasks' | 'logs' | 'sharing' | 'playback' | 'audio'
  | 'library' | 'downloads' | 'appearance' | 'language' | 'keyboard' | 'about';

// `requiresAbs` marks panes that only make sense with an Audiobookshelf server
// connection — they're hidden in local-only mode. `adminOnly` panes are hidden
// from non-admin users. Both are filtered at render time but keep their slot.
interface NavSection { id: SectionId; labelKey: TranslationKey; icon: IconName; keywords: string[]; requiresAbs?: boolean; adminOnly?: boolean; }

interface NavGroup { labelKey: TranslationKey; sections: NavSection[]; }

// Group by the intent that brought the user to Settings. A whole group vanishes
// when all of its sections are permission/source gated, keeping local-only mode
// concise without maintaining a second navigation model.
const NAV_GROUPS: NavGroup[] = [
  { labelKey: 'settings.group.device', sections: [
    { id: 'account', labelKey: 'settings.account', icon: 'home', keywords: ['profile', 'password', 'user', 'sign out', '账户', '密码', '退出'] },
    { id: 'appearance', labelKey: 'settings.appearance', icon: 'sliders', keywords: ['theme', 'accent', 'scale', 'cover size', 'layout', 'display', 'shelf', '主题', '外观', '强调色'] },
    { id: 'language', labelKey: 'settings.language', icon: 'info', keywords: ['language', 'locale', 'translation', 'date', 'time', '语言', '翻译', '日期'] },
    { id: 'audio', labelKey: 'settings.audio', icon: 'headphones', keywords: ['device', 'output', 'equalizer', 'eq', 'volume', '音频', '均衡器'] },
    { id: 'downloads', labelKey: 'settings.downloads', icon: 'download', keywords: ['offline', 'folder', 'storage', 'cache', 'retry', '下载', '离线'] },
    { id: 'keyboard', labelKey: 'settings.keyboard', icon: 'kbd', keywords: ['shortcut', 'hotkey', 'keys', '快捷键'] },
  ]},
  { labelKey: 'settings.group.libraries', sections: [
    { id: 'library', labelKey: 'settings.library', icon: 'grid', keywords: ['local', 'staging', 'import', 'scan', 'provider', 'open library', '书库', '导入'] },
    { id: 'playback', labelKey: 'settings.playback', icon: 'play', keywords: ['sleep timer', 'skip', 'speed', 'session', 'progress', 'resume', '播放', '倍速'] },
  ]},
  { labelKey: 'settings.group.server', sections: [
    { id: 'server', labelKey: 'settings.server', icon: 'monitor', keywords: ['sync', 'socket', 'connection', 'address', '服务器', '同步'], requiresAbs: true },
    { id: 'logs', labelKey: 'settings.logs', icon: 'list', keywords: ['diagnostic', 'errors', 'debug', 'report', '日志'], requiresAbs: true, adminOnly: true },
    { id: 'backups', labelKey: 'settings.backups', icon: 'file', keywords: ['restore', 'schedule', 'database', '备份'], requiresAbs: true, adminOnly: true },
    { id: 'notifications', labelKey: 'settings.notifications', icon: 'bell', keywords: ['apprise', 'alerts', 'events', '通知'], requiresAbs: true, adminOnly: true },
    { id: 'scheduled-tasks', labelKey: 'settings.scheduledTasks', icon: 'clock', keywords: ['jobs', 'scanner', 'maintenance', '任务'], requiresAbs: true, adminOnly: true },
    { id: 'sharing', labelKey: 'settings.sharing', icon: 'share', keywords: ['feeds', 'public link', 'opds', '分享'], requiresAbs: true, adminOnly: true },
  ]},
  { labelKey: 'settings.group.about', sections: [
    { id: 'about', labelKey: 'settings.about', icon: 'info', keywords: ['help', 'quick start', 'version', 'privacy', 'troubleshooting', '关于', '版本'] },
  ]},
];

const NAV = NAV_GROUPS.flatMap(group => group.sections);

function sectionVisible(section: NavSection, hasAbs: boolean, isAdmin: boolean): boolean {
  return !(section.requiresAbs && !hasAbs) && !(section.adminOnly && !isAdmin);
}

export default function Settings({ st, onLogout }: SettingsProps) {
  const { t } = useI18n();
  const requestedSection = NAV.some(item => item.id === st.settingsSection)
    ? st.settingsSection as SectionId
    : 'account';
  const [section, setSection] = useState<SectionId>(requestedSection);
  const [navQuery, setNavQuery] = useState('');
  // True when connected to an Audiobookshelf server. Local-only users (no token)
  // never see the ABS-only panes. authToken is seeded synchronously from the
  // skald.hasAuth presence flag, so this is stable across reloads and survives
  // the server being temporarily offline (the keyring token persists).
  const hasAbs = !!st.authToken && !!st.serverUrl;
  const visibleGroups = NAV_GROUPS
    .map(group => ({ ...group, sections: group.sections.filter(item => sectionVisible(item, hasAbs, st.isAdmin) && matchesSettingsSearch(t(item.labelKey), item.id, item.keywords, navQuery)) }))
    .filter(group => group.sections.length > 0);

  // Shell CTAs can target a pane while Settings is already mounted. Keep this
  // reactive rather than treating the requested pane as initial state only.
  useEffect(() => {
    if (NAV.some(item => item.id === st.settingsSection)) {
      setSection(st.settingsSection as SectionId);
    }
  }, [st.settingsSection]);

  // If the selected pane's nav entry becomes hidden (admin flag revoked, server
  // disconnected), fall back to Account rather than rendering a blank panel
  // whose nav item no longer exists.
  useEffect(() => {
    const nav = NAV.find(s => s.id === section);
    const hidden = !!nav && ((nav.requiresAbs && !hasAbs) || (nav.adminOnly && !st.isAdmin));
    if (hidden) setSection('account');
  }, [section, hasAbs, st.isAdmin]);

  async function handleSignOut() {
    try { await logout(); } catch { /* keyring failure is non-fatal */ }
    localStorage.removeItem('skald.hasAuth');
    // Keep the non-secret address as a returning-user convenience. Credentials,
    // identity, session state, and the live connection are still fully cleared.
    localStorage.removeItem('skald.serverUrl');
    localStorage.removeItem('skald.userId');
    localStorage.removeItem('skald.username');
    localStorage.removeItem('skald.sessionId');
    // The persisted profile is tokenless, but a signed-out machine shouldn't
    // keep the previous account's identity around either.
    localStorage.removeItem('skald.user');
    // Also exit local-only mode so the auth gate shows the login screen again.
    st.setLocalMode(false);
    onLogout();
  }

  return (
    <div className="ui-stack" style={{ flex: 1, minHeight: 0, padding: 'var(--s-4) var(--s-6) var(--s-5)' }}>
      <div className="ui-grow" style={{ display: 'flex', gap: 'var(--s-5)' }}>
        {/* Navigation rail. Uses the same list vocabulary as the app sidebar so
            Settings reads as part of the product, not a separate window. */}
        <aside className="ui-card ui-scroll" style={{ width: 248, flex: '0 0 248px', padding: 'var(--s-3)', display: 'flex', flexDirection: 'column', gap: 'var(--s-1)' }}>
          <input
            value={navQuery}
            onChange={e => setNavQuery(e.target.value)}
            placeholder={t('settings.findPlaceholder')}
            aria-label={t('settings.findPlaceholder')}
            className="ui-input"
            style={{ marginBottom: 'var(--s-2)' }}
          />
          {visibleGroups.map((group, groupIndex) => (
            <div key={group.labelKey} style={{ marginTop: groupIndex === 0 ? 0 : 'var(--s-3)' }}>
              <div className="ui-group-label" style={{ padding: '0 var(--s-2) var(--s-1)' }}>
                {t(group.labelKey)}
              </div>
              {group.sections.map(s => {
                const downloadCount = s.id === 'downloads' ? st.downloads.length : 0;
                const active = section === s.id;
                return (
                  <button
                    key={s.id}
                    type="button"
                    className={`ui-list__item${active ? ' ui-list__item--active' : ''}`}
                    aria-current={active ? 'page' : undefined}
                    onClick={() => { setSection(s.id); st.setSettingsSection(s.id); }}
                    style={active ? { color: 'var(--onyx-text)' } : undefined}
                  >
                    <span className="ui-list__icon" style={active ? { color: 'var(--onyx-accent)' } : undefined}>
                      <Icon name={s.icon} size={15} />
                    </span>
                    <span className="ui-list__label">{t(s.labelKey)}</span>
                    {downloadCount > 0 && <span className="ui-list__meta">{downloadCount}</span>}
                  </button>
                );
              })}
            </div>
          ))}
          <div className="ui-grow" />
        </aside>

        {/* Content column scrolls on its own so the rail stays put. */}
        <main className="ui-grow ui-scroll" style={{ paddingRight: 'var(--s-1)' }}>
          {section === 'account'          && <AccountSection st={st} onSignOut={handleSignOut} />}
          {section === 'server'           && <ServerSection st={st} />}
          {section === 'notifications'    && <NotificationsSection st={st} />}
          {section === 'backups'          && <BackupSection st={st} />}
          {section === 'scheduled-tasks'  && <ScheduledTasksSection st={st} />}
          {section === 'logs'             && <LogsSection st={st} />}
          {section === 'sharing'          && <SharingSection st={st} />}
          {section === 'playback'   && <PlaybackSection st={st} />}
          {section === 'audio'      && <AudioSection />}
          {section === 'library'    && <LibraryManagementSection st={st} />}
          {section === 'downloads'  && <DownloadsSection st={st} />}
          {section === 'appearance' && <AppearanceSection st={st} />}
          {section === 'language'   && <LanguageSection />}
          {section === 'keyboard'   && <KeyboardSection />}
          {section === 'about'      && <AboutSection st={st} />}
        </main>
      </div>
    </div>
  );
}
