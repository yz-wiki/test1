// Chapter navigation shared by the command palette and the now-playing bar.
//
// `OnyxState.currentBookChapters` carries per-chapter duration but no absolute
// offset (see Chapter in state/bookHelpers.ts), so the start of chapter N is the
// sum of the durations before it. Both callers need exactly that, and getting it
// wrong silently seeks to the wrong place — hence one implementation.
import type { OnyxState } from '../state/onyx';
import { seekAudio } from '../api/abs';
import { log } from './log';

/** Absolute start offset of every chapter, in seconds. */
export function chapterStarts(st: OnyxState): number[] {
  const starts: number[] = [];
  let cursor = 0;
  for (const chapter of st.currentBookChapters) {
    starts.push(cursor);
    cursor += chapter.dur;
  }
  return starts;
}

/** Index of the chapter containing `position`, or -1 when there are none. */
export function chapterIndexAt(st: OnyxState, position: number): number {
  const starts = chapterStarts(st);
  let index = -1;
  for (let i = 0; i < starts.length; i += 1) {
    if (position >= starts[i]) index = i;
  }
  return index;
}

/**
 * Seek to the previous/next chapter. Returns the new position, or null when the
 * request would fall outside the chapter list (start of first / end of last), so
 * callers can decide whether to fall through to something else.
 */
export function seekChapter(st: OnyxState, direction: 1 | -1): number | null {
  const starts = chapterStarts(st);
  if (!starts.length) return null;
  const current = chapterIndexAt(st, st.position);
  const target = current + direction;
  if (target < 0 || target >= starts.length) return null;
  const at = starts[target];
  st.setPosition(at);
  void seekAudio(at).catch(error =>
    log.warn('playback', 'chapter seek failed', { err: String(error) }));
  return at;
}
