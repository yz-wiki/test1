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
  hasToken,
  login as loginCommand,
  loginWithApiKey,
  type Library,
  type LibraryItem,
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
  route = $state<'library' | 'settings'>('library');
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
