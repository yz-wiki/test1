// Application shell — the macOS window frame.
//
// Responsibilities, in order of importance:
//   • own the sidebar visibility preference (persisted, survives restarts)
//   • own the command-palette open state and its global keystroke
//   • compose titlebar + sidebar + content into the flex skeleton the screens
//     expect (each screen is `flex: 1` inside a `min-height: 0` column)
//
// The screens themselves are untouched by this file: they still receive the one
// shared `st` object and render into `children`. That is deliberate — a shell
// rewrite should not ripple into 12k lines of screen code.
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import type { OnyxState } from '../../state/onyx';
import Titlebar from '../chrome/Titlebar';
import ActivityCenter from '../ActivityCenter';
import OnyxWash from '../chrome/OnyxWash';
import Sidebar from './Sidebar';
import CommandPalette from './CommandPalette';
import NowPlayingBar from './NowPlayingBar';
import { ShellChromeContext } from './ShellContext';
import { useI18n } from '../../i18n';
import { libraryDisplayLabel } from '../../lib/libraryPresentation';
import { toggleSidebarCompact, useSidebarCompact } from '../../lib/uiPrefs';

export interface ShellProps {
  st: OnyxState;
  children: ReactNode;
}

const COMPACT_BREAKPOINT = 1000;

/** Platform-appropriate modifier glyph for the palette hint. */
function paletteShortcutLabel(): string {
  const platform = typeof navigator === 'undefined' ? '' : navigator.platform;
  return /Mac|iPhone|iPad/i.test(platform) ? '⌘K' : 'Ctrl K';
}

export default function Shell({ st, children }: ShellProps) {
  const { t } = useI18n();
  // Shared with Settings → Appearance through lib/uiPrefs, so toggling it in
  // either place updates the other immediately. The rail is never removed — it
  // collapses to icons, because it owns the library switcher and the account.
  const sidebarCompactPref = useSidebarCompact();
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [narrow, setNarrow] = useState(() =>
    typeof window === 'undefined' ? false : window.innerWidth < COMPACT_BREAKPOINT);

  // Collapse to the icon rail on narrow windows instead of stealing width from
  // the shelf. Widening restores the full rail automatically — the user's own
  // show/hide preference is a separate axis and is never overwritten here.
  useEffect(() => {
    const onResize = () => setNarrow(window.innerWidth < COMPACT_BREAKPOINT);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // ── Back navigation ────────────────────────────────────────────────────────
  // A tiny stack of previous screens. Suppressed while the back action itself is
  // driving the change, otherwise the effect would immediately re-push the screen
  // we just left.
  const [history, setHistory] = useState<string[]>([]);
  const previousScreen = useRef(st.screen);
  const navigatingBack = useRef(false);

  useEffect(() => {
    if (navigatingBack.current) {
      navigatingBack.current = false;
      previousScreen.current = st.screen;
      return;
    }
    if (previousScreen.current === st.screen) return;
    const from = previousScreen.current;
    previousScreen.current = st.screen;
    setHistory(stack => [...stack.slice(-19), from]);
  }, [st.screen]);

  const goBack = useCallback(() => {
    setHistory(stack => {
      const target = stack[stack.length - 1];
      if (target) {
        navigatingBack.current = true;
        st.setScreen(target);
      }
      return stack.slice(0, -1);
    });
  }, [st.setScreen]);

  const toggleSidebar = useCallback(() => {
    toggleSidebarCompact();
  }, []);

  // ⌘K / Ctrl+K opens the palette. Bound here rather than in useGlobalShortcuts
  // because that hook talks to the Rust shortcut registrar; this one is a pure
  // in-webview binding that must also work while the window is unfocused-less.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== 'k') return;
      event.preventDefault();
      setPaletteOpen(open => !open);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const active = st.activeLibrary;

  // Titlebar copy: the primary label names the destination, the subtitle names
  // the source. Both are translated, so the chrome follows the language setting
  // without a restart.
  let title = t('misc.library');
  let subtitle: string | undefined;
  if (st.screen === 'settings') {
    title = t('settings.title');
    subtitle = t('nav.section.thisDevice');
  } else if (st.screen === 'player') {
    title = t('player.nowPlaying');
    subtitle = st.currentEpisode?.title || active?.name;
  } else if (st.screen === 'podcast') {
    title = t('nav.podcasts');
    subtitle = active?.name;
  } else if (active) {
    title = libraryDisplayLabel(active);
    subtitle = st.library.length > 0 ? t('misc.books', { count: st.library.length }) : t('misc.library');
  }

  const sidebarCompact = sidebarCompactPref || narrow;
  const chrome = { hasSidebar: true, sidebarCompact };

  return (
    <ShellChromeContext.Provider value={chrome}>
      <div className="mac-window">
        <OnyxWash isDark={st.theme !== 'light'} />

        <Titlebar
          title={title}
          subtitle={subtitle}
          isDark={st.theme !== 'light'}
          isOffline={st.isOffline}
          lastRefresh={st.lastLibraryRefresh}
          isUnencrypted={!!st.authToken && !!st.serverUrl && st.serverUrl.startsWith('http://')}
          trailing={<ActivityCenter st={st} />}
          onToggleSidebar={toggleSidebar}
          sidebarVisible={!sidebarCompact}
          onOpenPalette={() => setPaletteOpen(true)}
          paletteShortcut={paletteShortcutLabel()}
          onBack={goBack}
          canGoBack={history.length > 0}
        />

        <div className="mac-body">
          <Sidebar st={st} compact={sidebarCompact} onNavigate={() => setPaletteOpen(false)} />
          <main className="mac-content">
            <div className="mac-content__inner">{children}</div>
            {/* Playback stays reachable from every screen. The Player screen
                already owns the full transport, so the bar steps aside there. */}
            {st.screen !== 'player' && (
              <NowPlayingBar st={st} onExpand={() => st.setScreen('player')} />
            )}
          </main>
        </div>

        <CommandPalette
          st={st}
          open={paletteOpen}
          onClose={() => setPaletteOpen(false)}
          onToggleSidebar={toggleSidebar}
        />
      </div>
    </ShellChromeContext.Provider>
  );
}
