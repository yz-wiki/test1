/**
 * Downloads.
 *
 * The registry lives in Rust; this store mirrors it and tracks the transfers
 * that are in flight, so a page can show "3 of 12 files" without polling the
 * backend. The actual bytes never pass through the frontend.
 */
import { listen } from '@tauri-apps/api/event';
import {
  downloadItem,
  downloadLibraryFile,
  getDownloads,
  getDownloadsDir,
  removeDownload,
  cancelDownload,
  revealDownloadLocation,
  type DownloadRecord,
  type LibraryItem,
} from './ipc';
import { session } from './state.svelte';

interface ProgressEvent {
  itemId: string;
  title?: string;
  bytesDownloaded: number;
  totalBytes: number;
}

export interface Transfer {
  itemId: string;
  title: string;
  bytesDownloaded: number;
  totalBytes: number;
}

const KEY_CHAPTERS = 'skald.chapterFiles';

/** Single audio files saved one at a time, keyed `itemId|ino`. The Rust
 *  registry only tracks whole-item downloads, so these are remembered here. */
function loadChapterFiles(): string[] {
  try {
    const raw = localStorage.getItem(KEY_CHAPTERS);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

class DownloadsStore {
  records = $state<DownloadRecord[]>([]);
  chapterFiles = $state<string[]>(loadChapterFiles());
  transfers = $state<Record<string, Transfer>>({});
  error = $state<string | null>(null);
  private unlisten: (() => void)[] = [];

  async attach(): Promise<void> {
    if (this.unlisten.length > 0) return;

    const off = await listen<ProgressEvent>('download-progress', ({ payload }) => {
      this.transfers = {
        ...this.transfers,
        [payload.itemId]: {
          itemId: payload.itemId,
          title: payload.title ?? this.transfers[payload.itemId]?.title ?? '',
          bytesDownloaded: payload.bytesDownloaded,
          totalBytes: payload.totalBytes,
        },
      };
    });

    const done = await listen<{ itemId: string }>('download-complete', ({ payload }) => {
      this.dropTransfer(payload.itemId);
      void this.load();
    });

    const failed = await listen<{ itemId: string }>('download-failed', ({ payload }) => {
      this.dropTransfer(payload.itemId);
    });

    const cancelled = await listen<{ itemId: string }>('download-cancelled', ({ payload }) => {
      this.dropTransfer(payload.itemId);
    });

    this.unlisten = [off, done, failed, cancelled];
  }

  private dropTransfer(itemId: string): void {
    const next = { ...this.transfers };
    delete next[itemId];
    this.transfers = next;
  }

  async load(): Promise<void> {
    try {
      this.records = await getDownloads();
    } catch (reason) {
      this.error = (reason as Error).message;
    }
  }

  has(itemId: string): boolean {
    return this.records.some(record => record.itemId === itemId);
  }

  forItem(itemId: string): DownloadRecord | undefined {
    return this.records.find(record => record.itemId === itemId);
  }

  async start(item: LibraryItem, title: string, author: string): Promise<void> {
    const fileName = `${title || item.id}.zip`;
    this.transfers = {
      ...this.transfers,
      [item.id]: { itemId: item.id, title, bytesDownloaded: 0, totalBytes: 0 },
    };
    try {
      await downloadItem(
        // A download belongs to the server it came from, so the URL travels
        // with the request rather than being read back from the registry.
        session.serverUrl,
        item.id,
        fileName,
        title,
        author,
      );
    } catch (reason) {
      this.error = (reason as Error).message;
      this.dropTransfer(item.id);
      throw reason;
    }
  }

  hasChapter(itemId: string, ino: string): boolean {
    return this.chapterFiles.includes(`${itemId}|${ino}`);
  }

  /** Save one audio file (a chapter) next to the other downloads. */
  async saveChapter(
    serverUrl: string,
    itemId: string,
    ino: string,
    fileName: string,
  ): Promise<void> {
    const dir = await getDownloadsDir();
    const destination = `${dir}/${fileName}`.replace(/\\/g, '/');
    await downloadLibraryFile(serverUrl, itemId, ino, destination);
    const key = `${itemId}|${ino}`;
    if (!this.chapterFiles.includes(key)) {
      this.chapterFiles = [...this.chapterFiles, key];
      localStorage.setItem(KEY_CHAPTERS, JSON.stringify(this.chapterFiles));
    }
  }

  async remove(itemId: string): Promise<void> {
    try {
      await removeDownload(itemId);
      await this.load();
    } catch (reason) {
      this.error = (reason as Error).message;
    }
  }

  /** Cancel an in-flight transfer; Rust emits `download-cancelled` as well,
   *  so dropping it here is only the optimistic local half. */
  async cancel(itemId: string): Promise<void> {
    try {
      await cancelDownload(itemId);
      this.dropTransfer(itemId);
    } catch (reason) {
      this.error = (reason as Error).message;
    }
  }

  /** Open the downloaded folder in Explorer. */
  async reveal(itemId: string): Promise<void> {
    try {
      await revealDownloadLocation(itemId);
    } catch (reason) {
      this.error = (reason as Error).message;
    }
  }
}

export const downloads = new DownloadsStore();
