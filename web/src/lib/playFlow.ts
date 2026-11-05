/**
 * One play affordance, one behaviour.
 *
 * Starting a title is also a navigation: the listener expects the now-playing
 * screen, not a silent start behind the shelf. Callers used to call
 * `player.open()` directly and got three different behaviours depending on
 * whether the title was already loaded, played from the server, or came from
 * a local download.
 */
import { player } from './player.svelte';
import { reading } from './reading.svelte';
import { session } from './state.svelte';
import type { Episode, LibraryItem } from './ipc';

function hasChapterData(item: LibraryItem): boolean {
  return Boolean(item.media?.chapters?.length || item.media?.audioFiles?.length);
}

export async function playItem(
  item: LibraryItem,
  options: { episode?: Episode | null; queue?: Episode[]; startAt?: number } = {},
): Promise<void> {
  // A shelf item carries no chapters. Prefer the full item already fetched for
  // the continue shelf — otherwise the player opens with an empty chapter list
  // and "no chapter markers" for the whole session.
  const cached = reading.detail(item.id);
  const source = cached && hasChapterData(cached) ? cached : item;

  await player.open(source, options.episode ?? null, options.queue, options.startAt);
  // open() sets this on its success paths, but the "already current" early
  // return and any future fallback should still land on the player.
  player.expand();

  if (!options.episode && !hasChapterData(source)) {
    player.chaptersLoading = true;
    void reading.loadOne(session.serverUrl, item.id).then(full => {
      if (full) player.refreshItem(full);
      else player.chaptersLoading = false;
    });
  }
}
