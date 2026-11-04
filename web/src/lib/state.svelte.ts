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
    this.serverUrl = serverUrl;
    this.user = user;
    this.authenticated = true;
    localStorage.setItem(KEY_SERVER, serverUrl);
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

class UiStore {
  theme = $state<'graphite' | 'paper' | 'midnight'>(
    (localStorage.getItem('skald.theme') as 'graphite') ?? 'graphite',
  );
  reduceMotion = $state(localStorage.getItem('skald.reduceMotion') === 'true');
  route = $state<'library' | 'settings' | 'podcast' | 'book' | 'downloads'>('library');
  /** The item a detail route is showing. */
  itemId = $state<string | null>(null);
  query = $state('');

  constructor() {
    this.applyTheme();
    this.applyMotion();
  }

  setTheme(theme: 'graphite' | 'paper' | 'midnight'): void {
    this.theme = theme;
    localStorage.setItem('skald.theme', theme);
    this.applyTheme();
  }

  setReduceMotion(on: boolean): void {
    this.reduceMotion = on;
    localStorage.setItem('skald.reduceMotion', String(on));
    this.applyMotion();
  }

  private applyTheme(): void {
    document.documentElement.dataset.theme = this.theme;
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
