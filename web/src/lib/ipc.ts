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

export interface Episode {
  id: string;
  index?: number;
  season?: string;
  episode?: string;
  episodeType?: string;
  title: string;
  subtitle?: string;
  description?: string;
  publishedAt?: number;
  pubDate?: string;
  duration?: number;
}

export interface AudioFile {
  index?: number;
  ino?: string;
  /** Global offset of this file inside the book, in seconds. */
  startOffset: number;
  duration: number;
  metadata?: { filename?: string; ext?: string };
}

export interface LibraryFile {
  ino: string;
  fileType?: string;
  isSupplementary?: boolean;
  metadata?: {
    filename: string;
    size?: number;
    ext?: string;
    path?: string;
  };
}

export interface LibraryItem {
  id: string;
  libraryId?: string;
  mediaType?: 'book' | 'podcast';
  addedAt?: number;
  libraryFiles?: LibraryFile[];
  media?: {
    metadata?: MediaMetadata;
    duration?: number;
    numAudioFiles?: number;
    chapters?: { title: string; start: number; end: number }[];
    /** Podcasts only — ABS ships the episode list with the library items. */
    episodes?: Episode[];
    /** One entry per audio file; the only chapter-like data some books have. */
    audioFiles?: AudioFile[];
  };
}

/** One row of `/api/me`'s mediaProgress. Books key on the item id alone,
 *  podcasts add the episode id. */
export interface MediaProgress {
  libraryItemId: string;
  episodeId?: string | null;
  duration: number;
  progress: number;
  currentTime: number;
  isFinished: boolean;
  lastUpdate: number;
}

export interface Bookmark {
  libraryItemId: string;
  title: string;
  time: number;
}

export interface MeResponse {
  id: string;
  username: string;
  mediaProgress?: MediaProgress[];
  bookmarks?: Bookmark[];
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
export const logout = () => call<void>('logout');

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

export const getMe = (serverUrl: string) => call<MeResponse>('get_me', { serverUrl });

/** PATCH /api/items/:id/media — the shape Audiobookshelf expects. */
export const updateMedia = (
  serverUrl: string,
  itemId: string,
  payload: { metadata: Record<string, unknown>; tags?: string[] },
) => call<unknown>('update_media', { serverUrl, itemId, payload });

export interface UploadProgress {
  uploadId: string;
  title: string;
  bytesSent: number;
  totalBytes: number;
}

export const uploadMedia = (
  serverUrl: string,
  uploadId: string,
  libraryId: string,
  folderId: string,
  title: string,
  author: string,
  series: string,
  filePaths: string[],
) =>
  call<void>('upload_media', {
    serverUrl,
    uploadId,
    libraryId,
    folderId,
    title,
    author,
    series,
    filePaths,
  });

export const createBookmark = (serverUrl: string, itemId: string, time: number, title: string) =>
  call<Bookmark>('create_bookmark', { serverUrl, itemId, time, title });

// ─── Sync ────────────────────────────────────────────────────────────────────

export interface ListeningSession {
  id: string;
  bookId?: string | null;
  displayTitle?: string | null;
  author?: string | null;
  userId?: string;
  username?: string | null;
  playMethod?: number | null;
  deviceInfo?: { deviceName?: string; clientName?: string; osName?: string } | null;
  listeningTime?: number;
  createdAt?: number;
  updatedAt?: number;
}

export const getOpenSessions = (serverUrl: string) =>
  call<ListeningSession[]>('get_open_sessions', { serverUrl });

export const connectSocket = (serverUrl: string) =>
  call<void>('connect_socket', { serverUrl });

export const disconnectSocket = () => call<void>('disconnect_socket');

export const getOfflineProgressCount = () => call<number>('get_offline_progress_count');

export const flushOfflineProgress = (serverUrl: string) =>
  call<number>('flush_offline_progress', { serverUrl });

// ─── Administration (server-side; root/admin accounts only) ──────────────────

export interface AdminLibrary {
  id: string;
  name: string;
  mediaType: string;
  folders?: { id: string; fullPath: string }[];
  lastScan?: number | null;
}

export interface AdminUserRow {
  id: string;
  username: string;
  type: string;
  lastSeen?: number | null;
  createdAt?: number | null;
  isActive?: boolean | null;
  email?: string | null;
}

export interface ServerTask {
  id: string;
  action?: string;
  title?: string;
  description?: string;
  error?: string | null;
  isFinished?: boolean;
  isFailed?: boolean;
  startedAt?: number | null;
  finishedAt?: number | null;
}

export interface ServerBackup {
  id: string;
  datePretty?: string;
  filename?: string;
  fileSize?: number;
}

export const getLibrariesFull = (serverUrl: string) =>
  call<AdminLibrary[]>('get_libraries_full', { serverUrl });

export const scanLibrary = (serverUrl: string, libraryId: string, force = false) =>
  call<void>('scan_library', { serverUrl, libraryId, force });

export const getAllUsers = (serverUrl: string) =>
  call<AdminUserRow[]>('get_all_users', { serverUrl });

export const getTasks = (serverUrl: string) =>
  call<{ tasks: ServerTask[] }>('get_tasks', { serverUrl });

export const getBackups = (serverUrl: string) =>
  call<{ backups: ServerBackup[]; backupLocation?: string }>('get_backups', { serverUrl });

export const createBackup = (serverUrl: string) =>
  call<{ backups: ServerBackup[]; backupLocation?: string }>('create_backup', { serverUrl });

// ─── Playback ────────────────────────────────────────────────────────────────

export interface OpenSessionResult {
  sessionId: string;
  currentTime: number;
}

/** The Rust session's 1 Hz heartbeat. Everything the transport shows comes
 *  from here, so the UI never guesses a position and then drifts. */
export interface PlaybackTick {
  currentTime: number;
  duration: number;
  isPlaying: boolean;
}

export interface ResumeOutcome {
  position: number;
  rewound: number;
}

export const openPlaybackSession = (
  serverUrl: string,
  itemId: string,
  userId: string,
  startTime?: number,
  episodeId?: string,
) =>
  call<OpenSessionResult>('open_playback_session', {
    serverUrl,
    itemId,
    userId,
    episodeId: episodeId ?? null,
    startTime: startTime ?? null,
  });

export const playAudio = () => call<void>('play_audio');
export const pauseAudio = () => call<void>('pause_audio');

/** Resume applies the backend's configured auto-rewind. Do not reimplement it. */
export const resumeAudio = (chapterStart?: number) =>
  call<ResumeOutcome>('resume_audio', { chapterStart: chapterStart ?? null });

export const seekAudio = (secs: number) => call<void>('seek_audio', { secs });
export const setSpeed = (rate: number) => call<void>('set_speed', { rate });
export const setVolume = (vol: number) => call<void>('set_volume', { vol });
export const closeActiveSession = () => call<void>('close_active_session');

export const updateProgress = (
  serverUrl: string,
  itemId: string,
  currentTime: number,
  duration: number,
  isFinished: boolean,
  episodeId?: string,
) =>
  call<void>('update_progress', {
    serverUrl,
    itemId,
    episodeId: episodeId ?? null,
    currentTime,
    duration,
    isFinished,
  });

// ─── Devices, storage, equaliser ─────────────────────────────────────────────

export interface AudioDevice {
  id: string;
  name: string;
}

export const getAudioDevices = () => call<AudioDevice[]>('get_audio_devices');
export const setAudioDevice = (deviceId: string) =>
  call<void>('set_audio_device', { deviceId });

export const getDownloadsDir = () => call<string>('get_downloads_dir');
export const getCacheDir = () => call<string>('get_cache_dir');
export const setDownloadsDir = (dir: string) => call<void>('set_downloads_dir', { path: dir });
export const setCacheDir = (dir: string) => call<void>('set_cache_dir', { path: dir });
export const revealPath = (path: string) => call<void>('reveal_path', { path });
export const openLogDir = () => call<void>('open_log_dir');

export interface EqPreset {
  index: number;
  name: string;
}

export interface EqSettings {
  enabled: boolean;
  preamp: number;
  bands: number[];
  presetName?: string | null;
}

export const getEqPresets = () => call<EqPreset[]>('get_eq_presets');
export const getEqSettings = () => call<EqSettings>('get_eq_settings');
export const getEqBandFrequencies = () => call<number[]>('get_eq_band_frequencies');
export const setEqEnabled = (enabled: boolean) => call<void>('set_eq_enabled', { enabled });
export const setEqBand = (band: number, gain: number) =>
  call<void>('set_eq_band', { band, gain });
export const setEqPreamp = (gain: number) => call<void>('set_eq_preamp', { gain });
export const applyEqPreset = (index: number) => call<void>('apply_eq_preset', { index });
export const resetEq = () => call<void>('reset_eq');

// ─── Downloads ───────────────────────────────────────────────────────────────

export interface DownloadRecord {
  itemId: string;
  title: string;
  author: string;
  filePath: string;
  fileSize: number;
  downloadedAt: number;
  serverDeleted?: boolean;
}

export const getDownloads = () => call<DownloadRecord[]>('get_downloads');

export const downloadItem = (
  serverUrl: string,
  itemId: string,
  fileName: string,
  title: string,
  author: string,
) => call<string>('download_item', { serverUrl, itemId, fileName, title, author });

export const removeDownload = (itemId: string) => call<void>('remove_download', { itemId });

/** Offline playback: LibVLC reads the file directly, and the listening is
 *  queued for the server instead of streamed against a live session. */
export const playLocalFile = (
  filePath: string,
  itemId: string,
  startTime: number,
  localLibrary = false,
  episodeId?: string,
  baselineCaptured = false,
  serverLastUpdate?: number,
  speed?: number,
  serverUrl?: string,
  userId?: string,
) =>
  call<void>('play_local_file', {
    filePath,
    itemId,
    startTime,
    localLibrary,
    episodeId: episodeId ?? null,
    baselineCaptured,
    serverLastUpdate: serverLastUpdate ?? null,
    speed: speed ?? null,
    serverUrl: serverUrl ?? null,
    userId: userId ?? null,
  });
