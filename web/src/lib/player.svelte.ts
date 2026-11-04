/**
 * Playback state.
 *
 * The Rust session owns the truth: it opens the ABS `/play` session, feeds
 * LibVLC and emits a `playback-tick` every second. This store is a projection
 * of those ticks plus the actions the transport can take — it deliberately
 * keeps no timer of its own, because a local clock is exactly what makes a
 * playhead drift away from the audio.
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
  type LibraryItem,
  type PlaybackTick,
} from './ipc';
import { session } from './state.svelte';

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

class PlayerStore {
  item = $state<LibraryItem | null>(null);
  episodeId = $state<string | null>(null);
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

  readonly chapters = $derived(chapterSpans(this.item));

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

  readonly progress = $derived(this.duration > 0 ? this.position / this.duration : 0);

  readonly title = $derived(
    this.item?.media?.metadata?.title?.trim() || this.item?.id || '',
  );

  readonly subtitle = $derived.by(() => {
    const meta = this.item?.media?.metadata;
    if (!meta) return '';
    if (this.chapter?.title) return this.chapter.title;
    return [meta.authorName, meta.seriesName].filter(Boolean).join(' · ');
  });

  private unlisten: UnlistenFn | null = null;

  /** Subscribe once, at application start. Safe to call repeatedly. */
  async attach(): Promise<void> {
    if (this.unlisten) return;
    this.unlisten = await listen<PlaybackTick>('playback-tick', ({ payload }) => {
      this.position = payload.currentTime;
      this.playing = payload.isPlaying;
      if (payload.duration > 0) this.duration = payload.duration;
    });
  }

  detach(): void {
    this.unlisten?.();
    this.unlisten = null;
  }

  /** Start (or restart) an item. Clicking the item already playing toggles it. */
  async open(item: LibraryItem): Promise<void> {
    if (this.item?.id === item.id) {
      await this.toggle();
      return;
    }
    this.loading = true;
    this.error = null;
    this.item = item;
    this.episodeId = null;
    this.position = 0;
    this.duration = item.media?.duration ?? 0;
    this.playing = false;

    try {
      const result = await openPlaybackSession(
        session.serverUrl,
        item.id,
        session.user?.id ?? '',
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

  async skipChapter(direction: 1 | -1): Promise<void> {
    const list = this.chapters;
    if (list.length === 0) {
      await this.skip(direction * 30);
      return;
    }
    const index = this.chapterIndex;
    const next = list[index + direction];
    if (next) await this.seek(next.start);
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
