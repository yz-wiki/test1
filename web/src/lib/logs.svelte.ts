/**
 * Live log bus.
 *
 * There is no log file the WebView can tail, so the two streams are assembled
 * here: every command crossing the Rust boundary is a "server" line (name,
 * duration, outcome), while window errors, lifecycle events and player state
 * are "app" lines. Both are real events, not a decorative sample log.
 *
 * Kept in memory with a hard cap. Export/copy produce plain text; the on-disk
 * Rust log directory is reachable through the "open log folder" action.
 */
export type LogScope = 'app' | 'server';
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogEntry {
  id: number;
  at: number;
  scope: LogScope;
  level: LogLevel;
  source: string;
  message: string;
}

const MAX = 800;
const LEVEL_ORDER: Record<LogLevel, number> = { debug: 0, info: 1, warn: 2, error: 3 };

class LogStore {
  entries = $state<LogEntry[]>([]);
  /** Frozen view: collection continues, the list stops moving. */
  frozen = $state<LogEntry[] | null>(null);
  scope = $state<LogScope>('app');
  minLevel = $state<LogLevel | 'all'>('all');
  query = $state('');
  follow = $state(true);

  private seq = 0;

  push(scope: LogScope, level: LogLevel, source: string, message: string): void {
    const entry: LogEntry = {
      id: ++this.seq,
      at: Date.now(),
      scope,
      level,
      source,
      message: String(message).slice(0, 800),
    };
    // Svelte $state arrays are proxies; assigning a new array keeps the tail
    // update cheap and guarantees the derived view re-runs.
    this.entries = [...this.entries.slice(-(MAX - 1)), entry];
  }

  app(level: LogLevel, source: string, message: string): void {
    this.push('app', level, source, message);
  }

  server(level: LogLevel, source: string, message: string): void {
    this.push('server', level, source, message);
  }

  readonly visible = $derived.by(() => {
    const base = this.frozen ?? this.entries;
    const q = this.query.trim().toLowerCase();
    const min = this.minLevel === 'all' ? -1 : LEVEL_ORDER[this.minLevel];
    return base.filter(
      entry =>
        entry.scope === this.scope &&
        LEVEL_ORDER[entry.level] >= min &&
        (!q ||
          entry.message.toLowerCase().includes(q) ||
          entry.source.toLowerCase().includes(q)),
    );
  });

  readonly counts = $derived.by(() => {
    let app = 0;
    let server = 0;
    for (const entry of this.entries) {
      if (entry.scope === 'app') app += 1;
      else server += 1;
    }
    return { app, server };
  });

  toggleFreeze(): void {
    this.frozen = this.frozen ? null : [...this.entries];
  }

  clear(): void {
    this.entries = this.entries.filter(entry => entry.scope !== this.scope);
    if (this.frozen) this.frozen = [...this.entries];
  }

  asText(): string {
    const stamp = (at: number) => new Date(at).toLocaleTimeString('en-GB', { hour12: false });
    return this.visible
      .map(
        entry =>
          `${stamp(entry.at)}.${String(entry.at % 1000).padStart(3, '0')} ` +
          `${entry.level.toUpperCase().padEnd(5)} ${entry.source.padEnd(20)} ${entry.message}`,
      )
      .join('\n');
  }
}

export const logs = new LogStore();

export function formatLogTime(at: number): string {
  const date = new Date(at);
  const time = date.toLocaleTimeString('en-GB', { hour12: false });
  return `${time}.${String(at % 1000).padStart(3, '0')}`;
}
