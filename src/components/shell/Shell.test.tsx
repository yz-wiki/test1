// Shell integration tests.
//
// The shell is the one place where a regression is instantly visible to every
// user — it owns the window chrome, so a broken sidebar or a palette that never
// opens is unrecoverable from inside the app. These tests exercise the three
// contracts: the sidebar renders navigation, ⌘K/Ctrl+K toggles the palette, and
// the sidebar visibility preference actually round-trips.
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import type { OnyxState } from '../../state/onyx';
import { I18nProvider } from '../../i18n';

const windowStub = vi.hoisted(() => ({
  close: vi.fn(async () => {}),
  minimize: vi.fn(async () => {}),
  toggleMaximize: vi.fn(async () => {}),
  startDragging: vi.fn(async () => {}),
  startResizeDragging: vi.fn(async () => {}),
}));

vi.mock('@tauri-apps/api/window', () => ({
  getCurrentWindow: () => windowStub,
}));

import Shell from './Shell';
import { resetUiPrefsCache } from '../../lib/uiPrefs';

const library = {
  id: 'lib-1',
  name: 'Audiobooks',
  mediaType: 'book',
  source: 'abs',
  folders: [],
  displayOrder: 0,
  icon: '',
  provider: '',
  settings: {},
  createdAt: 0,
  lastUpdate: 0,
} as unknown as OnyxState['libraries'][number];

function makeState(overrides: Partial<OnyxState> = {}): OnyxState {
  return {
    theme: 'dark',
    setTheme: vi.fn(),
    screen: 'library',
    setScreen: vi.fn(),
    shelfTab: 'library',
    setShelfTab: vi.fn(),
    settingsSection: null,
    setSettingsSection: vi.fn(),
    libraries: [library],
    activeLibrary: library,
    currentLibraryId: 'lib-1',
    setActiveLibrary: vi.fn(async () => {}),
    setContextFilter: vi.fn(),
    library: [],
    downloads: [],
    currentBookId: '',
    currentBook: undefined,
    currentBookChapters: [],
    position: 0,
    setPosition: vi.fn(),
    playing: false,
    user: { username: 'reader' },
    localDisplayName: '',
    isAdmin: false,
    localMode: false,
    optionalTabs: {},
    isOffline: false,
    lastLibraryRefresh: null,
    authToken: '',
    serverUrl: '',
    activity: [],
    clearActivity: vi.fn(),
    ...overrides,
  } as unknown as OnyxState;
}

function renderShell(st: OnyxState) {
  return render(
    <I18nProvider>
      <Shell st={st}>
        <div>content</div>
      </Shell>
    </I18nProvider>,
  );
}

describe('Shell', () => {
  beforeEach(() => {
    localStorage.clear();
    // The sidebar preference is memoised in module scope (shared with Settings);
    // drop it so each test starts from the documented default.
    resetUiPrefsCache();
    vi.clearAllMocks();
  });

  it('renders sidebar navigation and the content region', () => {
    renderShell(makeState());
    expect(screen.getByRole('button', { name: /Home/i })).toBeTruthy();
    expect(screen.getByText('content')).toBeTruthy();
    // The account footer is part of the sidebar, not the toolbar.
    expect(screen.getByText('reader')).toBeTruthy();
  });

  it('opens the command palette with Ctrl+K and closes it with Escape', () => {
    const st = makeState();
    renderShell(st);

    expect(screen.queryByRole('dialog')).toBeNull();
    act(() => {
      fireEvent.keyDown(window, { key: 'k', ctrlKey: true });
    });
    const dialog = screen.getByRole('dialog');
    expect(dialog).toBeTruthy();
    // Commands are grouped and translated; Settings is always present.
    expect(screen.getByPlaceholderText(/Search commands/i)).toBeTruthy();

    act(() => {
      fireEvent.keyDown(dialog, { key: 'Escape' });
    });
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('filters palette commands by query', () => {
    renderShell(makeState());
    act(() => {
      fireEvent.keyDown(window, { key: 'k', ctrlKey: true });
    });
    const input = screen.getByPlaceholderText(/Search commands/i);
    fireEvent.change(input, { target: { value: 'settings' } });
    expect(screen.queryByText(/Nothing matches/i)).toBeNull();

    // A query with no matches falls back to the empty state instead of an empty list.
    fireEvent.change(input, { target: { value: 'zzzzz-no-such-command' } });
    expect(screen.queryByText(/Nothing matches/i)).toBeTruthy();
  });

  it('persists the sidebar visibility preference when toggled', () => {
    renderShell(makeState());
    const toggle = screen.getByRole('button', { name: /sidebar/i });
    fireEvent.click(toggle);
    expect(localStorage.getItem('skald.ui.sidebar')).toBe('false');
    // Sidebar nav is gone once hidden.
    expect(screen.queryByText('reader')).toBeNull();
  });

  it('navigates to Settings from the sidebar', () => {
    const st = makeState();
    renderShell(st);
    fireEvent.click(screen.getByRole('button', { name: /^Settings$/ }));
    expect(st.setScreen).toHaveBeenCalledWith('settings');
  });
});
