/**
 * Server connection state.
 *
 * The ABS socket is what makes progress and library changes show up live. It
 * lives in Rust; this store mirrors the events it emits and exposes the two
 * actions a listener actually wants: reconnect, and push whatever was listened
 * offline back to the server.
 */
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import {
  connectSocket,
  disconnectSocket,
  flushOfflineProgress,
  getOfflineProgressCount,
  getOpenSessions,
  type ListeningSession,
} from './ipc';

export type SocketState = 'offline' | 'connecting' | 'connected';

class SyncStore {
  socket = $state<SocketState>('offline');
  pending = $state(0);
  sessions = $state<ListeningSession[]>([]);
  busy = $state(false);
  error = $state<string | null>(null);

  private unlisten: UnlistenFn[] = [];

  async attach(): Promise<void> {
    if (this.unlisten.length > 0) return;
    this.unlisten = [
      await listen('socket-connected', () => (this.socket = 'connected')),
      await listen('socket-authenticated', () => (this.socket = 'connected')),
      await listen('socket-disconnected', () => (this.socket = 'offline')),
      await listen('socket-error', () => (this.socket = 'offline')),
      // The Rust side flushes on its own schedule too; when it does, the queue
      // this screen is showing has just changed under it.
      await listen('offline-progress-flushed', () => void this.refresh()),
    ];
  }

  /** Connect unless already connected or mid-handshake — safe to call from an
   *  effect that re-runs whenever the session object changes. */
  async ensureConnected(serverUrl: string): Promise<void> {
    if (!serverUrl || this.socket !== 'offline') return;
    await this.connect(serverUrl);
  }

  async connect(serverUrl: string): Promise<void> {
    if (!serverUrl) return;
    this.socket = 'connecting';
    this.error = null;
    try {
      await connectSocket(serverUrl);
      this.socket = 'connected';
    } catch (reason) {
      this.socket = 'offline';
      this.error = (reason as Error).message;
    }
  }

  async disconnect(): Promise<void> {
    try {
      await disconnectSocket();
    } finally {
      this.socket = 'offline';
    }
  }

  async refresh(serverUrl?: string): Promise<void> {
    try {
      this.pending = await getOfflineProgressCount();
      if (serverUrl) this.sessions = await getOpenSessions(serverUrl);
    } catch (reason) {
      this.error = (reason as Error).message;
    }
  }

  /** Push queued offline listening to the server. Returns how many entries went. */
  async flush(serverUrl: string): Promise<number> {
    if (!serverUrl) return 0;
    this.busy = true;
    this.error = null;
    try {
      const sent = await flushOfflineProgress(serverUrl);
      this.pending = await getOfflineProgressCount();
      return sent;
    } catch (reason) {
      this.error = (reason as Error).message;
      return 0;
    } finally {
      this.busy = false;
    }
  }
}

export const sync = new SyncStore();
