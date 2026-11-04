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
  resumeAudio,
  seekAudio,
  setSpeed as setSpeedCommand,
  setVolume as setVolumeCommand,
  type Episode,
  type LibraryItem,
  type PlaybackTick,
} from './ipc';
import { progress, session } from './state.svelte';

export interface Chapter {
  title: string;
  start: number;
  end: number;
}

const KEY_RATE = 'skald.player.rate';
const KEY_VOLUME = 'skald.player.volume';

export const RATES = [0.8, 1, 1.2, 1.5, 1.75, 2] as const;

/** Chapters arrive from ABS with absolute offsets; older caches only carry a
 *  duration, so a missing `start` is derived by accumulating. */
export function chapterSpans(item: LibraryItem | null): Chapter[] {
  const raw = item?.media?.chapters ?? [];
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
   *  loaded toggles it, so clicking a title is never destructive. */
  async open(item: LibraryItem, episode?: Episode | null, queue?: Episode[]): Promise<void> {
    if (this.isCurrent(item, episode)) {
      await this.toggle();
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
    this.position = saved && !saved.isFinished ? saved.currentTime : 0;
    this.playing = false;

    try {
      const result = await openPlaybackSession(
        session.serverUrl,
        item.id,
        session.user?.id ?? '',
        undefined,
        episode?.id,
      );
      this.sessionId = result.sessionId;
      if (result.currentTime > 0) this.position = result.currentTime;
      if (this.rate !== 1) await setSpeedCommand(this.rate);
      if (this.volume !== 1) await setVolumeCommand(this.volume);
      await playAudio();
      this.playing = true;
      this.expanded = true;
    } catch (error) {
      this.error = (error as Error).message;
      this.playing = false;
    } finally {
      this.loading = false;
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
      await setVolumeCommand(volume);
    } catch (error) {
      this.error = (error as Error).message;
    }
  }

  collapse(): void {
    this.expanded = false;
  }

  expand(): void {
    if (this.item) this.expanded = true;
  }

  clearError(): void {
    this.error = null;
  }
}

export const player = new PlayerStore();
