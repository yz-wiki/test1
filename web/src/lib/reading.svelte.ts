/**
 * Reading-position details.
 *
 * Library list items deliberately omit chapters and audio files — fetching
 * them for every cover in a 1000-book shelf would be wasteful. But the handful
 * of books on a "continue listening" shelf really do need that data: otherwise
 * the only thing we can say about a position is an author name.
 *
 * This store lazily fetches full items for the few ids a screen asks about,
 * caches them for the session, and resolves a saved time into a chapter.
 */
import { fetchItem, type LibraryItem } from './ipc';
import { chapterSpans } from './player.svelte';

export interface ChapterInfo {
  /** 1-based ordinal. */
  index: number;
  total: number;
  title: string;
  start: number;
  end: number;
  /** Seconds already listened inside this chapter. */
  into: number;
  length: number;
}

class ReadingStore {
  details = $state<Record<string, LibraryItem>>({});
  private pending = new Set<string>();
  private failed = new Set<string>();

  /** Fire-and-forget: a screen calls this for the ids it is showing. */
  async ensure(serverUrl: string, ids: string[]): Promise<void> {
    if (!serverUrl) return;
    const missing = ids.filter(
      id => id && !this.details[id] && !this.pending.has(id) && !this.failed.has(id),
    );
    // A shelf shows at most a dozen. Keep concurrency bounded.
    for (const id of missing.slice(0, 16)) {
      this.pending.add(id);
      void fetchItem(serverUrl, id)
        .then(item => {
          this.details = { ...this.details, [id]: item };
        })
        .catch(() => this.failed.add(id))
        .finally(() => this.pending.delete(id));
    }
  }

  detail(id: string): LibraryItem | null {
    return this.details[id] ?? null;
  }

  /** Uses the full item when available, the list item as a fallback. */
  chapterAt(item: LibraryItem | null, position: number): ChapterInfo | null {
    if (!item) return null;
    const source = this.details[item.id] ?? item;
    const spans = chapterSpans(source);
    if (spans.length === 0) return null;

    let index = 0;
    for (let i = spans.length - 1; i >= 0; i -= 1) {
      if (position >= spans[i].start) {
        index = i;
        break;
      }
    }
    const span = spans[index];
    const start = Number.isFinite(span.start) ? span.start : 0;
    const end = Number.isFinite(span.end) && span.end > start ? span.end : start + 1;
    return {
      index: index + 1,
      total: spans.length,
      title: span.title,
      start,
      end,
      into: Math.max(position - start, 0),
      length: end - start,
    };
  }
}

export const reading = new ReadingStore();
