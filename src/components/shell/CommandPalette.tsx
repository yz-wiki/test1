// Command palette (⌘K / Ctrl+K).
//
// The single highest-leverage addition for a mouse-heavy app: one keystroke
// reaches every screen, every library, and the handful of player actions that
// otherwise require hunting for a transport button. Filtering is
// subsequence-free on purpose — plain `includes` over a small keyword set is
// easier to predict than fuzzy scoring and never surprises the user by ranking a
// weak match first.
import { useEffect, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent } from 'react';
import type { OnyxState } from '../../state/onyx';
import Icon from '../Icon';
import type { IconName } from '../Icon';
import { useI18n } from '../../i18n';
import type { TranslationKey } from '../../i18n';
import { togglePlayback } from '../../api/playbook';
import { seekAudio } from '../../api/abs';
import { libraryDisplayLabel } from '../../lib/libraryPresentation';
import { log } from '../../lib/log';

export interface CommandPaletteProps {
  st: OnyxState;
  open: boolean;
  onClose: () => void;
  onToggleSidebar: () => void;
}

interface Command {
  id: string;
  group: string;
  label: string;
  icon: IconName;
  hint?: string;
  keywords?: string;
  run: () => void;
}

const SETTINGS_ENTRIES: Array<{ section: string; labelKey: TranslationKey; icon: IconName; keywords: string }> = [
  { section: 'account', labelKey: 'settings.account', icon: 'home', keywords: 'profile password user sign out 账户' },
  { section: 'appearance', labelKey: 'settings.appearance', icon: 'sliders', keywords: 'theme accent scale layout 外观 主题' },
  { section: 'language', labelKey: 'settings.language', icon: 'info', keywords: 'locale language translate 语言 翻译' },
  { section: 'playback', labelKey: 'settings.playback', icon: 'play', keywords: 'skip speed resume sleep 播放' },
  { section: 'audio', labelKey: 'settings.audio', icon: 'headphones', keywords: 'equalizer device output 音频' },
  { section: 'library', labelKey: 'settings.library', icon: 'grid', keywords: 'staging import scan 书库' },
  { section: 'downloads', labelKey: 'settings.downloads', icon: 'download', keywords: 'offline storage 下载' },
  { section: 'keyboard', labelKey: 'settings.keyboard', icon: 'kbd', keywords: 'shortcut hotkey 快捷键' },
  { section: 'about', labelKey: 'settings.about', icon: 'info', keywords: 'version privacy 关于' },
];

export default function CommandPalette({ st, open, onClose, onToggleSidebar }: CommandPaletteProps) {
  const { t, locale, setLocale } = useI18n();
  const [query, setQuery] = useState('');
  const [cursor, setCursor] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    setQuery('');
    setCursor(0);
    // Focus after paint — the dialog mounts in the same commit that flips `open`,
    // so an immediate focus() would land on a detached node in StrictMode.
    const frame = requestAnimationFrame(() => inputRef.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, [open]);

  // Chapter entries in OnyxState carry { n, title, duration } only — absolute
  // start offsets are derived by accumulating durations, which is also how the
  // rest of the app positions its chapter list.
  const chapterSeek = (direction: 1 | -1) => {
    const chapters = st.currentBookChapters;
    if (!chapters.length) return;
    const starts: number[] = [];
    let cursor = 0;
    for (const chapter of chapters) {
      starts.push(cursor);
      cursor += chapter.dur;
    }
    let index = -1;
    for (let i = 0; i < starts.length; i += 1) {
      if (st.position >= starts[i]) index = i;
    }
    const target = index + direction;
    if (target < 0 || target >= starts.length) return;
    const at = starts[target];
    st.setPosition(at);
    void seekAudio(at).catch(error =>
      log.warn('playback', 'palette chapter seek failed', { err: String(error) }));
  };

  const commands = useMemo<Command[]>(() => {
    const list: Command[] = [];
    const go = (fn: () => void) => () => { fn(); onClose(); };

    list.push(
      { id: 'go-home', group: t('palette.group.navigate'), label: t('nav.home'), icon: 'home', keywords: 'home library shelf 主页 书库', run: go(() => { st.setScreen('library'); st.setShelfTab('library'); }) },
      { id: 'go-recent', group: t('palette.group.navigate'), label: t('nav.recentlyAdded'), icon: 'clock', keywords: 'recent new 最近', run: go(() => { st.setScreen('library'); st.setShelfTab('recently-added'); }) },
      { id: 'go-series', group: t('palette.group.navigate'), label: t('nav.series'), icon: 'layers', keywords: 'series 系列', run: go(() => { st.setScreen('library'); st.setShelfTab('series'); }) },
      { id: 'go-authors', group: t('palette.group.navigate'), label: t('nav.authors'), icon: 'edit', keywords: 'author writer 作者', run: go(() => { st.setScreen('library'); st.setShelfTab('authors'); }) },
      { id: 'go-collections', group: t('palette.group.navigate'), label: t('nav.collections'), icon: 'grid', keywords: 'collection 合集', run: go(() => { st.setScreen('library'); st.setShelfTab('collections'); }) },
      { id: 'go-player', group: t('palette.group.navigate'), label: t('nav.nowPlaying'), icon: 'headphones', keywords: 'player now playing 播放 正在', run: go(() => st.setScreen('player')) },
      { id: 'go-settings', group: t('palette.group.navigate'), label: t('nav.settings'), icon: 'sliders', keywords: 'preferences 设置', run: go(() => st.setScreen('settings')) },
    );

    for (const library of st.libraries) {
      list.push({
        id: `lib-${library.id}`,
        group: t('palette.group.library'),
        label: libraryDisplayLabel(library),
        icon: library.mediaType === 'podcast' ? 'cast' : 'layers',
        keywords: `${library.name} ${library.source} 书库`,
        run: go(() => {
          if (library.id !== st.currentLibraryId) {
            st.setActiveLibrary(library.id).catch(error =>
              log.error('library', 'palette library switch failed', { id: library.id, err: String(error) }));
          }
          st.setScreen('library');
        }),
      });
    }

    list.push(
      {
        id: 'action-playpause',
        group: t('palette.group.actions'),
        label: st.playing ? t('player.pause') : t('player.play'),
        icon: st.playing ? 'pause' : 'play',
        keywords: 'play pause transport 播放 暂停',
        run: go(() => { void togglePlayback(st).catch(error => log.warn('playback', 'palette toggle failed', { err: String(error) })); }),
      },
      { id: 'action-next-chapter', group: t('palette.group.actions'), label: t('palette.action.nextChapter'), icon: 'next-chapter', keywords: 'chapter skip 下一章', run: go(() => chapterSeek(1)) },
      { id: 'action-prev-chapter', group: t('palette.group.actions'), label: t('palette.action.prevChapter'), icon: 'prev-chapter', keywords: 'chapter back 上一章', run: go(() => chapterSeek(-1)) },
      { id: 'action-toggle-theme', group: t('palette.group.actions'), label: t('palette.action.toggleTheme'), icon: 'sleep', keywords: 'dark light theme appearance 主题 深色 浅色', run: go(() => st.setTheme(st.theme === 'light' ? 'dark' : 'light')) },
      { id: 'action-toggle-sidebar', group: t('palette.group.actions'), label: t('palette.action.toggleSidebar'), icon: 'list', keywords: 'sidebar rail navigation 侧边栏', run: go(onToggleSidebar) },
      {
        id: 'action-toggle-language',
        group: t('palette.group.actions'),
        label: t('palette.action.toggleLanguage'),
        icon: 'info',
        keywords: 'language locale chinese english 语言 中文 英文',
        run: go(() => setLocale(locale === 'zh-CN' ? 'en' : 'zh-CN')),
      },
    );

    for (const entry of SETTINGS_ENTRIES) {
      list.push({
        id: `settings-${entry.section}`,
        group: t('palette.group.settings'),
        label: t(entry.labelKey),
        icon: entry.icon,
        keywords: entry.keywords,
        run: go(() => { st.setSettingsSection(entry.section); st.setScreen('settings'); }),
      });
    }

    return list;
  }, [st, t, locale, setLocale, onClose, onToggleSidebar]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return commands;
    return commands.filter(command =>
      `${command.label} ${command.keywords ?? ''}`.toLowerCase().includes(needle));
  }, [commands, query]);

  // Keep the cursor in range when the result set shrinks under it.
  useEffect(() => {
    setCursor(current => (filtered.length === 0 ? 0 : Math.min(current, filtered.length - 1)));
  }, [filtered.length]);

  // Scroll the active row into view when navigating by keyboard only. Guarded
  // because jsdom (unit tests) does not implement scrollIntoView.
  useEffect(() => {
    const node = listRef.current?.querySelector<HTMLElement>('[data-active="true"]');
    node?.scrollIntoView?.({ block: 'nearest' });
  }, [cursor, filtered.length]);

  if (!open) return null;

  const grouped = filtered.reduce<Record<string, Command[]>>((acc, command) => {
    (acc[command.group] ??= []).push(command);
    return acc;
  }, {});

  // Flat index must match the render order of the grouped list.
  let flatIndex = -1;

  const handleKeyDown = (event: ReactKeyboardEvent) => {
    if (event.key === 'Escape') { event.preventDefault(); onClose(); return; }
    if (event.key === 'ArrowDown') { event.preventDefault(); setCursor(current => (current + 1) % Math.max(1, filtered.length)); return; }
    if (event.key === 'ArrowUp') { event.preventDefault(); setCursor(current => (current - 1 + Math.max(1, filtered.length)) % Math.max(1, filtered.length)); return; }
    if (event.key === 'Enter') {
      event.preventDefault();
      filtered[cursor]?.run();
    }
  };

  return (
    <div className="mac-palette-scrim" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div className="mac-palette" role="dialog" aria-modal="true" aria-label={t('palette.title')} onKeyDown={handleKeyDown}>
        <div className="mac-palette__search">
          <span style={{ display: 'inline-flex', color: 'var(--onyx-text-mute)' }}><Icon name="search" size={15} /></span>
          <input
            ref={inputRef}
            className="mac-palette__input"
            value={query}
            placeholder={t('palette.placeholder')}
            aria-label={t('palette.title')}
            onChange={(event) => { setQuery(event.target.value); setCursor(0); }}
          />
          <span className="mac-kbd">esc</span>
        </div>

        <div className="mac-palette__list mac-scroll" ref={listRef}>
          {filtered.length === 0 && (
            <div className="mac-palette__empty">{t('palette.empty', { query })}</div>
          )}
          {Object.entries(grouped).map(([group, items]) => (
            <div key={group}>
              <div className="mac-palette__group">{group}</div>
              {items.map(item => {
                flatIndex += 1;
                const isActive = flatIndex === cursor;
                return (
                  <button
                    key={item.id}
                    type="button"
                    className={`mac-palette__row${isActive ? ' mac-palette__row--active' : ''}`}
                    data-active={isActive}
                    onMouseMove={() => { const index = filtered.indexOf(item); if (index >= 0 && index !== cursor) setCursor(index); }}
                    onClick={item.run}
                  >
                    <span className="mac-palette__row-icon"><Icon name={item.icon} size={14} /></span>
                    <span className="mac-palette__row-label">{item.label}</span>
                    {item.hint && <span className="mac-palette__row-hint">{item.hint}</span>}
                  </button>
                );
              })}
            </div>
          ))}
        </div>

        <div className="mac-palette__footer">
          <span>{t('palette.hint.navigate')}</span>
          <span>{t('palette.hint.select')}</span>
          <span>{t('palette.hint.dismiss')}</span>
        </div>
      </div>
    </div>
  );
}
