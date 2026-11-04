/**
 * Typed boundary to the Rust core.
 *
 * The old frontend scattered `invoke(...)` calls through components and screens,
 * each with its own ad-hoc error handling. Here every command lives in one file,
 * returns a typed result, and throws a single `IpcError` shape — so a screen
 * never has to know a command name or guess at a payload.
 */
import { invoke } from '@tauri-apps/api/core';

export class IpcError extends Error {
  constructor(public command: string, message: string) {
    super(message);
    this.name = 'IpcError';
  }
}

async function call<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  try {
    return await invoke<T>(command, args);
  } catch (error) {
    throw new IpcError(command, typeof error === 'string' ? error : String(error));
  }
}

// ─── Domain types (only the fields this UI reads) ────────────────────────────

export interface Library {
  id: string;
  name: string;
  mediaType: 'book' | 'podcast';
  icon?: string;
  folders?: { id: string; fullPath: string }[];
}

export interface MediaMetadata {
  title?: string;
  subtitle?: string;
  authorName?: string;
  narratorName?: string;
  seriesName?: string;
  seriesSequence?: string;
  description?: string;
  publisher?: string;
  publishedYear?: string;
  language?: string;
  genres?: string[];
  tags?: string[];
}

export interface LibraryItem {
  id: string;
  libraryId?: string;
  mediaType?: 'book' | 'podcast';
  media?: {
    metadata?: MediaMetadata;
    duration?: number;
    numAudioFiles?: number;
    chapters?: { title: string; start: number; end: number }[];
  };
}

export interface User {
  id: string;
  username: string;
  type?: string;
  token?: string;
}

export interface LoginResult {
  user: User;
  serverSettings?: unknown;
}

// ─── Commands ────────────────────────────────────────────────────────────────

export const hasToken = () => call<boolean>('has_token');

export const login = (serverUrl: string, username: string, password: string) =>
  call<LoginResult>('login', { serverUrl, username, password });

export const loginWithApiKey = (serverUrl: string, apiKey: string) =>
  call<LoginResult & { token: string }>('login_with_api_key', { serverUrl, apiKey });

export const fetchLibraries = (serverUrl: string) =>
  call<Library[]>('fetch_libraries', { serverUrl });

export const fetchLibraryItems = (serverUrl: string, libraryId: string) =>
  call<LibraryItem[]>('fetch_library_items', { serverUrl, libraryId });

export const fetchItem = (serverUrl: string, itemId: string) =>
  call<LibraryItem>('fetch_item', { serverUrl, itemId });
