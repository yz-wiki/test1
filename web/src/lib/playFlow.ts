/**
 * One play affordance, one behaviour — with an explicit destination.
 *
 * Starting a title used to be a navigation: every caller ended up on the
 * now-playing screen whether it asked for it or not. That made "继续收听" on the
 * shelf a page jump instead of a resume. `present` now names the intent:
 *
 *   - browse surfaces (shelf, continue list, book page) start in place and let
 *     the bar announce it;
 *   - the bar itself, the "正在播放" rail entry and the expanded arrow open the
 *     full player, because that is what the listener clicked.
 */
import { player } from './player.svelte';
import { reading } from './reading.svelte';
import { session } from './state.svelte';
import type { Episode, LibraryItem } from './ipc';

function hasChapterData(item: LibraryItem): boolean {
  return Boolean(item.media?.chapters?.length || item.media?.audioFiles?.length);
}

export interface PlayOptions {
  episode?: Episode | null;
  queue?: Episode[];
  startAt?: number;
  /** true = open the full player screen, false = stay where we are. */
  present?: boolean;
}

export async function playItem(item: LibraryItem, options: PlayOptions = {}): Promise<void> {
  const present = options.present ?? false;

  // A shelf item carries no chapters. Prefer the full item already fetched for
  // the continue shelf — otherwise the player opens with an empty chapter list
  // and "no chapter markers" for the whole session.
  const cached = reading.detail(item.id);
  const source = cached && hasChapterData(cached) ? cached : item;

  await player.open(source, options.episode ?? null, options.queue, options.startAt, present);

  // The start happened behind the current page: the bar is the only evidence.
  // Without this the listener reads it as a dead click (the 2.12 regression).
  if (!present) player.pulse();

  if (!options.episode && !hasChapterData(source)) {
    player.chaptersLoading = true;
    void reading.loadOne(session.serverUrl, item.id).then(full => {
      if (full) player.refreshItem(full);
      else player.chaptersLoading = false;
    });
  }
}
