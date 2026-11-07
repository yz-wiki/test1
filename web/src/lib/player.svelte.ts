/**
 * Playback state.
 *
 * The Rust session owns the truth: it opens the ABS `/play` session, feeds
 * LibVLC and emits a `playback-tick` every second. This store is a projection
 * of those ticks plus the actions the transport can take — it deliberately
 * keeps no timer of its own, because a local clock is exactly what makes a
 * playhead drift away from the audio.
 *
 * Books and podcast episodes share one player. Which one is loaded is `kind`;
 * the only behavioural difference is what "next" means (chapter vs episode).
 */
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import {
  openPlaybackSession,
  pauseAudio,
  playAudio,
  playLocalFile,
  resumeAudio,
  seekAudio,
  setSpeed as setSpeedCommand,
  setVolume as setVolumeCommand,
  type Episode,
  type LibraryItem,
  type PlaybackTick,
} from './ipc';
import { progress, session } from './state.svelte';
import { downloads } from './downloads.svelte';

export interface Chapter {
  title: string;
  start: number;
  end: number;
}

const KEY_RATE = 'skald.player.rate';
const KEY_VOLUME = 'skald.player.volume';

export const RATES = [0.8, 1, 1.2, 1.5, 1.75, 2] as const;

/** Sleep timer choices. `chapter` stops at the end of the current chapter. */
export type SleepMode = 'off' | 15 | 30 | 45 | 60 | 'chapter';

/**
 * Chapter list for an item.
 *
 * ABS books normally carry explicit chapters. Some do not — a serialised novel
 * is often one audio file per chapter with no chapter table — and those would
 * otherwise show an empty chapter panel and a single 189-hour progress bar.
 * In that case the audio files *are* the chapters, so they stand in.
 */
export function chapterSpans(item: LibraryItem | null): Chapter[] {
  const raw = item?.media?.chapters ?? [];
  if (raw.length > 0) {
    let cursor = 0;
    return raw.map(chapter => {
      const start = Number.isFinite(chapter.start) ? chapter.start : cursor;
      const end = Number.isFinite(chapter.end) && chapter.end > start
        ? chapter.end
        : start + 1;
      cursor = end;
      return { title: chapter.title, start, end };
    });
  }

  const files = [...(item?.media?.audioFiles ?? [])].sort(
    (a, b) => (a.startOffset ?? 0) - (b.startOffset ?? 0),
  );
  if (files.length <= 1) return [];

  let cursor = 0;
  return files.map((file, index) => {
    const start = Number.isFinite(file.startOffset) ? file.startOffset : cursor;
    const end = start + (file.duration > 0 ? file.duration : 1);
    cursor = end;
    const name = (file.metadata?.filename ?? '').replace(/\.[^.]+$/, '').trim();
    return { title: name || `#${index + 1}`, start, end };
  });
}

/** Newest first: ABS returns podcast episodes in feed order, while listeners
 *  expect the latest episode at the top. */
export function episodesNewestFirst(item: LibraryItem | null): Episode[] {
  const list = [...(item?.media?.episodes ?? [])];
  return list.sort((a, b) => {
    const at = a.publishedAt ?? (a.pubDate ? Date.parse(a.pubDate) : 0) ?? 0;
    const bt = b.publishedAt ?? (b.pubDate ? Date.parse(b.pubDate) : 0) ?? 0;
    if (at !== bt) return bt - at;
    return (b.index ?? 0) - (a.index ?? 0);
  });
}

class PlayerStore {
  kind = $state<'book' | 'episode'>('book');
  item = $state<LibraryItem | null>(null);
  episode = $state<Episode | null>(null);
  /** Sibling episodes, so next/previous walks the show, not the whole library. */
  queue = $state<Episode[]>([]);
  sessionId = $state<string | null>(null);

  position = $state(0);
  duration = $state(0);
  playing = $state(false);
  loading = $state(false);
  error = $state<string | null>(null);

  rate = $state(Number(localStorage.getItem(KEY_RATE)) || 1);
  volume = $state(
    localStorage.getItem(KEY_VOLUME) === null ? 1 : Number(localStorage.getItem(KEY_VOLUME)),
  );

  /** True while the full player screen is open; the bar hides then. */
  expanded = $state(false);
  /** A list item has no chapter table; this is true until the full item arrives. */
  chaptersLoading = $state(false);
  /**
   * Bumped when playback starts *without* opening the full screen. The bar
   * listens for it so a title that begins behind the shelf still announces
   * itself — the 2.12 lesson was that a silent start reads as "nothing happened".
   */
  announcedAt = $state(0);

  sleepMode = $state<SleepMode>('off');
  sleepRemaining = $state(0);

  private sleepTimer: ReturnType<typeof setInterval> | null = null;
  private sleepChapter = -1;

  readonly chapters = $derived(this.kind === 'book' ? chapterSpans(this.item) : []);

  readonly chapterIndex = $derived.by(() => {
    const list = this.chapters;
    if (list.length === 0) return -1;
    const at = this.position + 0.25;
    for (let index = list.length - 1; index >= 0; index -= 1) {
      if (at >= list[index].start) return index;
    }
    return 0;
  });

  readonly chapter = $derived(
    this.chapterIndex >= 0 ? this.chapters[this.chapterIndex] : null,
  );

  /** How far "next" can go: a chapter list for books, an episode queue for shows. */
  readonly queueIndex = $derived(
    this.kind === 'episode' && this.episode
      ? this.queue.findIndex(entry => entry.id === this.episode?.id)
      : -1,
  );

  readonly canStepBack = $derived(
    this.kind === 'episode'
      ? this.queueIndex > 0
      : this.chapterIndex > 0,
  );

  readonly canStepForward = $derived(
    this.kind === 'episode'
      ? this.queueIndex >= 0 && this.queueIndex < this.queue.length - 1
      : this.chapters.length > 0 && this.chapterIndex < this.chapters.length - 1,
  );

  readonly progress = $derived(this.duration > 0 ? this.position / this.duration : 0);

  readonly showTitle = $derived(this.item?.media?.metadata?.title?.trim() ?? '');

  readonly title = $derived(
    this.kind === 'episode' && this.episode
      ? this.episode.title
      : (this.showTitle || this.item?.id || ''),
  );

  readonly subtitle = $derived.by(() => {
    const meta = this.item?.media?.metadata;
    if (this.kind === 'episode') {
      return [this.showTitle, meta?.authorName].filter(Boolean).join(' · ');
    }
    if (this.chapter?.title) return this.chapter.title;
    return [meta?.authorName, meta?.seriesName].filter(Boolean).join(' · ');
  });

  private unlisten: UnlistenFn | null = null;

  /** Subscribe once, at application start. Safe to call repeatedly. */
  async attach(): Promise<void> {
    if (this.unlisten) return;
    let wasPlaying = false;
    this.unlisten = await listen<PlaybackTick>('playback-tick', ({ payload }) => {
      this.position = payload.currentTime;
      this.playing = payload.isPlaying;
      if (payload.duration > 0) this.duration = payload.duration;

      // The server writes progress on pause; re-reading it here is what keeps
      // the shelf's "continue listening" bar honest without polling.
      if (wasPlaying && !payload.isPlaying) {
        void progress.load(session.serverUrl, true);
      }
      wasPlaying = payload.isPlaying;

      // End-of-chapter sleep: the chapter index moving past the armed one means
      // the chapter that was playing when the timer was set has finished.
      if (this.sleepMode === 'chapter' && this.playing && this.chapterIndex > this.sleepChapter) {
        this.stopForSleep();
      }
    });
  }

  detach(): void {
    this.unlisten?.();
    this.unlisten = null;
  }

  private isCurrent(item: LibraryItem, episode?: Episode | null): boolean {
    if (this.item?.id !== item.id) return false;
    const currentEpisode = this.episode?.id ?? null;
    const wanted = episode?.id ?? null;
    return currentEpisode === wanted;
  }

  /** Start a book, or an episode of a podcast. Re-opening what is already
   *  loaded toggles it, so clicking a title is never destructive.
   *
   *  `present` decides whether starting pushes the full player screen. Browsing
   *  surfaces pass false and leave the listener where they were; the bar is the
   *  receipt that it started. */
  async open(
    item: LibraryItem,
    episode?: Episode | null,
    queue?: Episode[],
    startAt?: number,
    present = true,
  ): Promise<void> {
    if (!startAt && this.isCurrent(item, episode)) {
      // "Continue listening" must never pause a title that is already playing.
      // Only resume when paused, and only take over the screen when asked to.
      if (!this.playing) await this.toggle();
      if (present) this.expanded = true;
      return;
    }

    this.loading = true;
    this.error = null;
    this.kind = episode ? 'episode' : 'book';
    this.item = item;
    this.episode = episode ?? null;
    if (queue) this.queue = queue;
    if (!episode) this.queue = [];

    const saved = progress.for(item.id, episode?.id ?? null);
    this.duration = episode?.duration ?? item.media?.duration ?? 0;
    this.position = startAt ?? (saved && !saved.isFinished ? saved.currentTime : 0);
    this.playing = false;

    // Present the screen immediately: the licence for "continue listening" to
    // feel instant is showing that the click landed. Waiting for the session
    // request and the codec to open before switching screens is what made a
    // slow server read as a dead button. Collapsed again below if it fails.
    if (present) this.expanded = true;

    try {
      const result = await openPlaybackSession(
        session.serverUrl,
        item.id,
        session.user?.id ?? '',
        startAt,
        episode?.id,
      );
      this.sessionId = result.sessionId;
      if (result.currentTime > 0) this.position = result.currentTime;
      // Rate and volume are independent of the media arriving. Fire them in
      // parallel with the open instead of awaiting two IPC round-trips first.
      const tune = Promise.all([
        this.rate !== 1 ? setSpeedCommand(this.rate) : null,
        this.volume !== 1 ? setVolumeCommand(Math.round(this.volume * 100)) : null,
      ].filter(Boolean)).catch(() => undefined);
      await playAudio();
      void tune;
      this.playing = true;
      if (present) this.expanded = true;
    } catch (error) {
      // A downloaded book still plays with no network at all: LibVLC reads the
      // local file and the listening is queued for the server instead.
      const local = downloads.forItem(item.id);
      if (local && !episode && (await this.tryLocal(local.filePath, item.id, saved?.lastUpdate, present))) {
        return;
      }
      this.error = (error as Error).message;
      this.playing = false;
      // Do not strand the listener on a player screen that has nothing to play.
      if (present) this.expanded = false;
    } finally {
      this.loading = false;
    }
  }

  /** Returns true when the local file actually started playing. */
  private async tryLocal(
    filePath: string,
    itemId: string,
    serverLastUpdate?: number,
    present = true,
  ): Promise<boolean> {
    try {
      await playLocalFile(
        filePath,
        itemId,
        this.position,
        false,
        undefined,
        // The server revision this listening branches from, so the queued
        // progress can be merged instead of overwriting newer server state.
        true,
        serverLastUpdate,
        this.rate,
        session.serverUrl,
        session.user?.id ?? '',
      );
      this.sessionId = null;
      this.playing = true;
      if (present) this.expanded = true;
      this.error = null;
      return true;
    } catch {
      return false;
    }
  }

  async toggle(): Promise<void> {
    if (!this.item) return;
    const wasPlaying = this.playing;
    this.playing = !wasPlaying;
    try {
      if (wasPlaying) {
        await pauseAudio();
      } else {
        const outcome = await resumeAudio(this.chapter?.start);
        if (outcome && outcome.position > 0) this.position = outcome.position;
      }
    } catch (error) {
      this.playing = wasPlaying;
      this.error = (error as Error).message;
    }
  }

  async seek(seconds: number): Promise<void> {
    if (!this.item) return;
    const target = Math.min(Math.max(seconds, 0), this.duration || seconds);
    this.position = target;
    try {
      await seekAudio(target);
    } catch (error) {
      this.error = (error as Error).message;
    }
  }

  seekFraction(fraction: number): Promise<void> {
    return this.seek(fraction * (this.duration || 0));
  }

  skip(delta: number): Promise<void> {
    return this.seek(this.position + delta);
  }

  /** "Next" = next chapter in a book, next episode in a show. */
  async step(direction: 1 | -1): Promise<void> {
    if (this.kind === 'episode') {
      await this.stepEpisode(direction);
      return;
    }
    const list = this.chapters;
    if (list.length === 0) {
      await this.skip(direction * 30);
      return;
    }
    const next = list[this.chapterIndex + direction];
    if (next) await this.seek(next.start);
  }

  private async stepEpisode(direction: 1 | -1): Promise<void> {
    const item = this.item;
    if (!item || this.queueIndex < 0) return;
    const next = this.queue[this.queueIndex + direction];
    if (!next) return;
    // Moving to another episode is an explicit "play this", so it starts
    // playing even if the previous one was paused.
    await this.open(item, next, this.queue);
  }

  async setRate(rate: number): Promise<void> {
    this.rate = rate;
    localStorage.setItem(KEY_RATE, String(rate));
    try {
      await setSpeedCommand(rate);
    } catch (error) {
      this.error = (error as Error).message;
    }
  }

  async setVolume(value: number): Promise<void> {
    const volume = Math.min(Math.max(value, 0), 1);
    this.volume = volume;
    localStorage.setItem(KEY_VOLUME, String(volume));
    try {
      // LibVLC takes 0–100; the UI works in 0–1 like every other audio API.
      await setVolumeCommand(Math.round(volume * 100));
    } catch (error) {
      this.error = (error as Error).message;
    }
  }

  /**
   * Sleep timer.
   *
   * The countdown is the one clock this store does own — it is wall time, not
   * audio position, so it cannot drift from anything. `chapter` mode instead
   * arms a flag that the tick listener checks against the chapter index.
   */
  setSleep(mode: SleepMode): void {
    this.clearSleep();
    this.sleepMode = mode;
    if (mode === 'off') return;

    if (mode === 'chapter') {
      this.sleepChapter = this.chapterIndex;
      return;
    }

    this.sleepRemaining = mode * 60;
    this.sleepTimer = setInterval(() => {
      if (!this.playing) return; // paused time does not count down
      this.sleepRemaining -= 1;
      if (this.sleepRemaining <= 0) this.stopForSleep();
    }, 1000);
  }

  clearSleep(): void {
    if (this.sleepTimer) {
      clearInterval(this.sleepTimer);
      this.sleepTimer = null;
    }
    this.sleepMode = 'off';
    this.sleepRemaining = 0;
    this.sleepChapter = -1;
  }

  private stopForSleep(): void {
    this.clearSleep();
    this.playing = false;
    void pauseAudio().catch(() => {});
  }

  /** Replace the loaded item with its full version (chapters, files, series)
   *  without touching position, rate or the running session. */
  refreshItem(item: LibraryItem): void {
    if (this.item?.id !== item.id) return;
    this.item = item;
    this.chaptersLoading = false;
  }

  collapse(): void {
    this.expanded = false;
  }

  expand(): void {
    if (this.item) this.expanded = true;
  }

  /** Tell the bar that something started, so it can flash instead of the
   *  screen changing under the listener's finger. */
  pulse(): void {
    this.announcedAt = Date.now();
  }

  clearError(): void {
    this.error = null;
  }
}

export const player = new PlayerStore();
