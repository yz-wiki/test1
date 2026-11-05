/**
 * Application state.
 *
 * One small store per concern instead of a single 2,000-line hook: `session`
 * (credentials + libraries), `library` (items for the active library), `ui`
 * (theme, motion). Screens import what they read, so a change to the player
 * never re-renders the shelf.
 */
import {
  fetchLibraries,
  fetchLibraryItems,
  getMe,
  hasToken,
  login as loginCommand,
  loginWithApiKey,
  type Bookmark,
  type Library,
  type LibraryItem,
  type MediaProgress,
  type User,
} from './ipc';
import type { TranslationKey } from './i18n.svelte';

const KEY_SERVER = 'skald.serverUrl';
const KEY_LIBRARY = 'skald.libraryId';

class SessionStore {
  serverUrl = $state('');
  user = $state<User | null>(null);
  authenticated = $state(false);
  libraries = $state<Library[]>([]);
  activeLibraryId = $state<string | null>(null);
  loading = $state(false);
  error = $state<string | null>(null);
  /** Set when the session died on us, so the sign-in screen can say why. */
  authNotice = $state<string | null>(null);

  readonly activeLibrary = $derived(
    this.libraries.find(library => library.id === this.activeLibraryId) ?? this.libraries[0] ?? null,
  );

  /** Restore the previous session, if the keyring still holds a token. */
  async bootstrap(): Promise<void> {
    this.serverUrl = localStorage.getItem(KEY_SERVER) ?? '';
    if (!this.serverUrl) return;
    let token = false;
    try {
      token = await hasToken();
    } catch {
      return;
    }
    if (!token) return;

    // Restoring the token is not the same as knowing who the user is: without
    // this the sidebar showed "Unknown" and the admin entry stayed hidden.
    try {
      const me = await getMe(this.serverUrl);
      this.user = { id: me.id, username: me.username, type: me.type };
    } catch (reason) {
      // A *dead* token must not be treated as a live session — that is what left
      // every screen showing "Not authenticated" with no way back to sign-in.
      const message = (reason as Error).message;
      if (/not authenticated|no token|expired/i.test(message)) {
        this.expire();
        return;
      }
      // Anything else (server down, timeout) still deserves a shell to browse.
    }

    this.authenticated = true;
    await this.loadLibraries();
  }

  async loadLibraries(): Promise<void> {
    if (!this.serverUrl) return;
    this.loading = true;
    this.error = null;
    try {
      this.libraries = await fetchLibraries(this.serverUrl);
      const remembered = localStorage.getItem(KEY_LIBRARY);
      const exists = this.libraries.some(library => library.id === remembered);
      this.activeLibraryId = exists ? remembered : this.libraries[0]?.id ?? null;
    } catch (error) {
      this.error = (error as Error).message;
    } finally {
      this.loading = false;
    }
  }

  async signInWithKey(host: string, apiKey: string): Promise<void> {
    const serverUrl = normalizeServer(host);
    const result = await loginWithApiKey(serverUrl, apiKey);
    this.applyAuth(serverUrl, result.user);
    await this.loadLibraries();
  }

  async signInWithPassword(host: string, username: string, password: string): Promise<void> {
    const serverUrl = normalizeServer(host);
    const result = await loginCommand(serverUrl, username, password);
    this.applyAuth(serverUrl, result.user);
    await this.loadLibraries();
  }

  private applyAuth(serverUrl: string, user: User): void {
    this.authNotice = null;
    this.serverUrl = serverUrl;
    this.user = user;
    this.authenticated = true;
    localStorage.setItem(KEY_SERVER, serverUrl);
  }

  /** The server rejected our credential: drop to sign-in and say so. */
  expire(): void {
    this.authNotice = 'auth.expired';
    this.signOut();
  }

  /**
   * An unknown role must NOT hide the server screen. ABS sometimes omits
   * `type` from /api/me, and hiding the entry made uploads and server tools
   * disappear entirely for root users.
   */
  readonly canManageServer = $derived(
    !this.user?.type || this.user.type === 'root' || this.user.type === 'admin',
  );

  /** Forget the session locally; the caller clears the stored token first. */
  signOut(): void {
    this.user = null;
    this.authenticated = false;
    this.libraries = [];
    this.activeLibraryId = null;
    localStorage.removeItem(KEY_SERVER);
    localStorage.removeItem(KEY_LIBRARY);
  }

  selectLibrary(id: string): void {
    this.activeLibraryId = id;
    localStorage.setItem(KEY_LIBRARY, id);
  }
}

/** Accept "host", "host:port" or a full URL; the commands want a base URL. */
export function normalizeServer(input: string): string {
  const trimmed = input.trim().replace(/\/+$/, '');
  if (!trimmed) return '';
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `http://${trimmed}`;
}

class LibraryStore {
  items = $state<LibraryItem[]>([]);
  loading = $state(false);
  error = $state<string | null>(null);
  /** Set when the session died on us, so the sign-in screen can say why. */
  authNotice = $state<string | null>(null);
  private loadedFor = '';

  async load(serverUrl: string, libraryId: string | null, force = false): Promise<void> {
    if (!serverUrl || !libraryId) return;
    const key = `${serverUrl}|${libraryId}`;
    if (!force && key === this.loadedFor) return;
    this.loading = true;
    this.error = null;
    try {
      this.items = await fetchLibraryItems(serverUrl, libraryId);
      this.loadedFor = key;
    } catch (error) {
      this.error = (error as Error).message;
    } finally {
      this.loading = false;
    }
  }

  reset(): void {
    this.items = [];
    this.loadedFor = '';
    this.error = null;
  }
}

export const THEMES = ['graphite', 'slate', 'midnight', 'nord', 'paper', 'daylight', 'porcelain', 'sepia', 'custom'] as const;
export type ThemeId = (typeof THEMES)[number];

/** Accent swatches: the first one is each theme's own accent. */
export const ACCENTS = [
  '#8b7bf7',
  '#5b8def',
  '#3aa6a0',
  '#4caf72',
  '#e0a13a',
  '#e2606a',
  '#c46bd0',
  '#9aa2ad',
] as const;

export const SCALES = [0.9, 1, 1.1, 1.25] as const;

function stored<T extends string>(key: string, allowed: readonly T[], fallback: T): T {
  const value = localStorage.getItem(key);
  return value && (allowed as readonly string[]).includes(value) ? (value as T) : fallback;
}

export const CUSTOM_VARS: { key: string; label: TranslationKey }[] = [
  { key: '--canvas', label: 'theme.var.canvas' },
  { key: '--surface', label: 'theme.var.surface' },
  { key: '--surface-raised', label: 'theme.var.raised' },
  { key: '--text', label: 'theme.var.text' },
  { key: '--text-secondary', label: 'theme.var.secondary' },
  { key: '--accent', label: 'theme.var.accent' },
  { key: '--hairline', label: 'theme.var.hairline' },
];

export const CUSTOM_DEFAULT: Record<string, string> = {
  '--canvas': '#f5f7fb',
  '--surface': '#ffffff',
  '--surface-raised': '#eaf0fa',
  '--text': '#121826',
  '--text-secondary': '#4c5566',
  '--accent': '#3b6ef5',
  '--hairline': '#dbe2ec',
};

function loadCustomVars(): Record<string, string> {
  try {
    const raw = localStorage.getItem('skald.customVars');
    return raw ? { ...CUSTOM_DEFAULT, ...(JSON.parse(raw) as Record<string, string>) } : { ...CUSTOM_DEFAULT };
  } catch {
    return { ...CUSTOM_DEFAULT };
  }
}

class UiStore {
  theme = $state<ThemeId>(stored('skald.theme', THEMES, 'graphite'));
  /** Custom theme inherits a built-in base and overrides tokens on top. */
  customBase = $state<ThemeId>(stored('skald.customBase', THEMES, 'daylight'));
  customVars = $state<Record<string, string>>(loadCustomVars());
  customCss = $state(localStorage.getItem('skald.customCss') ?? '');
  /** The library view is shared between the sidebar and the page switcher. */
  libraryView = $state<'home' | 'books' | 'series' | 'authors' | 'narrators'>('home');
  /** Three densities over one data set, not three collections of cards.
      `compact` is the small-square card used by the author/series shelves,
      offered for books too so a 1 000-title library stays scannable. */
  libraryLayout = $state<'grid' | 'compact' | 'list'>(
    (() => {
      const saved = localStorage.getItem('skald.libraryLayout');
      return saved === 'list' || saved === 'compact' ? saved : 'grid';
    })(),
  );
  tileSize = $state(Number(localStorage.getItem('skald.tileSize')) || 148);
  /** null = use the theme's own accent. */
  accent = $state<string | null>(localStorage.getItem('skald.accent'));
  scale = $state<number>(Number(localStorage.getItem('skald.scale')) || 1);
  reduceMotion = $state(localStorage.getItem('skald.reduceMotion') === 'true');
  /** Undecorated window: closing hides to the tray instead of quitting. */
  closeToTray = $state(localStorage.getItem('skald.closeToTray') !== 'false');
  route = $state<'library' | 'continue' | 'settings' | 'podcast' | 'book' | 'downloads' | 'admin'>('library');
  /** The item a detail route is showing. */
  itemId = $state<string | null>(null);
  query = $state('');
  /** Bumped when something asks the library search box for focus. */
  focusSearch = $state(0);
  /** Which settings pane to open; set when the account chip is clicked. */
  settingsSection = $state('display');
  /**
   * Rail width is a user decision with an "auto" default. A single boolean made
   * the sidebar's shape depend on a click made three sessions ago; three states
   * keep the narrow-window fold without losing a deliberate choice.
   */
  railMode = $state<'auto' | 'open' | 'closed'>(
    (() => {
      const saved = localStorage.getItem('skald.railMode');
      return saved === 'open' || saved === 'closed' ? saved : 'auto';
    })(),
  );

  constructor() {
    this.applyTheme();
    this.applyCustom();
    this.applyAccent();
    this.applyScale();
    this.applyMotion();
  }

  setLibraryView(view: 'home' | 'books' | 'series' | 'authors' | 'narrators'): void {
    this.libraryView = view;
  }

  setLibraryLayout(layout: 'grid' | 'compact' | 'list'): void {
    this.libraryLayout = layout;
    localStorage.setItem('skald.libraryLayout', layout);
  }

  setTileSize(size: number): void {
    this.tileSize = Math.min(280, Math.max(112, Math.round(size)));
    localStorage.setItem('skald.tileSize', String(this.tileSize));
  }

  setRail(mode: 'auto' | 'open' | 'closed'): void {
    this.railMode = mode;
    localStorage.setItem('skald.railMode', mode);
  }

  setCustomBase(base: ThemeId): void {
    this.customBase = base === 'custom' ? 'daylight' : base;
    localStorage.setItem('skald.customBase', this.customBase);
    this.applyTheme();
  }

  setCustomVar(key: string, value: string): void {
    this.customVars = { ...this.customVars, [key]: value };
    localStorage.setItem('skald.customVars', JSON.stringify(this.customVars));
    this.applyCustom();
  }

  setCustomCss(css: string): void {
    this.customCss = css;
    localStorage.setItem('skald.customCss', css);
    this.applyCustom();
  }

  resetCustom(): void {
    this.customVars = { ...CUSTOM_DEFAULT };
    this.customCss = '';
    localStorage.setItem('skald.customVars', JSON.stringify(this.customVars));
    localStorage.removeItem('skald.customCss');
    this.applyCustom();
  }

  setTheme(theme: ThemeId): void {
    this.theme = theme;
    localStorage.setItem('skald.theme', theme);
    this.applyTheme();
  }

  setAccent(accent: string | null): void {
    this.accent = accent;
    if (accent) localStorage.setItem('skald.accent', accent);
    else localStorage.removeItem('skald.accent');
    this.applyAccent();
  }

  setScale(scale: number): void {
    this.scale = scale;
    localStorage.setItem('skald.scale', String(scale));
    this.applyScale();
  }

  setReduceMotion(on: boolean): void {
    this.reduceMotion = on;
    localStorage.setItem('skald.reduceMotion', String(on));
    this.applyMotion();
  }

  setCloseToTray(on: boolean): void {
    this.closeToTray = on;
    localStorage.setItem('skald.closeToTray', String(on));
  }

  private applyTheme(): void {
    const root = document.documentElement;
    // A custom theme keeps a built-in base for every token the editor does not
    // touch, then overrides the visible ones through html.custom.
    root.dataset.theme = this.theme === 'custom' ? this.customBase : this.theme;
    root.classList.toggle('custom', this.theme === 'custom');
  }

  private applyCustom(): void {
    let el = document.getElementById('skald-custom') as HTMLStyleElement | null;
    if (!el) {
      el = document.createElement('style');
      el.id = 'skald-custom';
      document.head.appendChild(el);
    }
    const lines: string[] = ['html.custom {'];
    for (const [key, value] of Object.entries(this.customVars)) {
      lines.push('  ' + key + ': ' + value + ';');
    }
    lines.push('}', this.customCss);
    el.textContent = lines.join(String.fromCharCode(10));
  }

  /**
   * The accent overrides the theme's own. Hover/soft/line are derived with
   * color-mix so a single hex produces a coherent set.
   */
  private applyAccent(): void {
    const root = document.documentElement;
    if (!this.accent) {
      root.style.removeProperty('--accent');
      root.style.removeProperty('--accent-hover');
      root.style.removeProperty('--accent-soft');
      root.style.removeProperty('--accent-line');
      return;
    }
    root.style.setProperty('--accent', this.accent);
    root.style.setProperty('--accent-hover', `color-mix(in oklab, ${this.accent} 82%, white)`);
    root.style.setProperty('--accent-soft', `color-mix(in oklab, ${this.accent} 16%, transparent)`);
    root.style.setProperty('--accent-line', `color-mix(in oklab, ${this.accent} 42%, transparent)`);
  }

  /**
   * Chromium's `zoom` scales CSS pixels, including `vh`, so the shell divides
   * the viewport by the scale to keep the window exactly filled.
   */
  private applyScale(): void {
    const root = document.documentElement;
    root.style.setProperty('--ui-scale', String(this.scale));
    root.style.zoom = String(this.scale);
  }

  private applyMotion(): void {
    document.documentElement.dataset.motion = this.reduceMotion ? 'reduced' : 'full';
  }
}

export const session = new SessionStore();
export const library = new LibraryStore();
export const ui = new UiStore();

/**
 * Listening progress, straight from `/api/me`.
 *
 * ABS already stores this; the client's job is only to look it up. Keeping it
 * in one store means the shelf, the podcast list and the player all read the
 * same numbers instead of each fetching their own copy.
 */
class ProgressStore {
  rows = $state<MediaProgress[]>([]);
  marks = $state<Bookmark[]>([]);
  private loadedFor = '';

  async load(serverUrl: string, force = false): Promise<void> {
    if (!serverUrl || (!force && serverUrl === this.loadedFor)) return;
    try {
      const me = await getMe(serverUrl);
      this.rows = me.mediaProgress ?? [];
      this.marks = me.bookmarks ?? [];
      this.loadedFor = serverUrl;
    } catch {
      // Progress is decoration: a failure must never block the library.
    }
  }

  for(itemId: string, episodeId?: string | null): MediaProgress | undefined {
    const wanted = episodeId ?? null;
    return this.rows.find(
      row => row.libraryItemId === itemId && (row.episodeId ?? null) === wanted,
    );
  }

  /** 0–1, finished rows counted as complete even if ABS stored 0.99. */
  fraction(itemId: string, episodeId?: string | null): number {
    const row = this.for(itemId, episodeId);
    if (!row) return 0;
    if (row.isFinished) return 1;
    if (row.duration > 0) return Math.min(row.currentTime / row.duration, 1);
    return Math.min(Math.max(row.progress, 0), 1);
  }

  /** Bookmarks for one title, earliest first — the order they are reached in. */
  bookmarksFor(itemId: string): Bookmark[] {
    return this.marks
      .filter(mark => mark.libraryItemId === itemId)
      .sort((a, b) => a.time - b.time);
  }

  reset(): void {
    this.rows = [];
    this.marks = [];
    this.loadedFor = '';
  }
}

export const progress = new ProgressStore();
