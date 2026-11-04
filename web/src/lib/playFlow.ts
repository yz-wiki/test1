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
import type { Episode, LibraryItem } from './ipc';

export async function playItem(
  item: LibraryItem,
  options: { episode?: Episode | null; queue?: Episode[]; startAt?: number } = {},
): Promise<void> {
  await player.open(item, options.episode ?? null, options.queue, options.startAt);
  // open() sets this on its success paths, but the "already current" early
  // return and any future fallback should still land on the player.
  player.expand();
}
