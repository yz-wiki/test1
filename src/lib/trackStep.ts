/**
 * Step to the neighbour "track".
 *
 * For a book that means the previous/next chapter — what the transport's
 * double-chevron buttons have always done. For a podcast episode it means the
 * previous/next *episode* in the show, which is what a listener actually expects
 * from those buttons; falling back to chapters there would be wrong on the many
 * shows whose episodes carry no chapter marks at all.
 *
 * Direction within a show follows that show's own playback order setting, so
 * "next" walks towards newer episodes on a newest-first show and towards older
 * ones on an oldest-first show — the same order auto-play-next uses.
 */
import type { LibraryItem, OnyxState, PodcastEpisode } from '../state/onyx';
import { playEpisode } from '../api/playbook';
import { episodesOf, showWithEpisodes } from '../state/upNextTarget';
import { episodeDirection } from '../lib/upNextPrefs';
import { seekChapter } from './chapterNav';
import { log } from './log';

export type StepDirection = -1 | 1;

/** Publication timestamp, used only for ordering. */
function pubTime(episode: PodcastEpisode): number {
  const raw = (episode as { publishedAt?: number; pubDate?: string }).publishedAt;
  if (typeof raw === 'number' && raw > 0) return raw;
  const date = (episode as { pubDate?: string }).pubDate;
  const parsed = date ? Date.parse(date) : NaN;
  return Number.isNaN(parsed) ? 0 : parsed;
}

export async function stepTrack(st: OnyxState, direction: StepDirection): Promise<void> {
  const currentEpisode = st.currentEpisode;

  // ── Books (and the rare podcast episode without a feed): move by chapter ──
  if (!currentEpisode) {
    seekChapter(st, direction);
    return;
  }

  const itemId = st.playingItem?.id ?? st.currentBookId;
  if (!itemId) return;

  let show: LibraryItem | undefined;
  try {
    show = await showWithEpisodes(st, itemId, [st.playingItem ?? undefined]);
  } catch (error) {
    log.warn('playback', 'episode list unavailable for track step', { itemId, err: String(error) });
  }
  const episodes = show ? episodesOf(show) : [];
  if (!show || episodes.length === 0) {
    // No feed to walk: chapters are the only meaningful neighbour.
    seekChapter(st, direction);
    return;
  }

  const ordered = [...episodes].sort((a, b) => pubTime(a) - pubTime(b));
  if (episodeDirection(show.id) === 'newest') ordered.reverse();

  const at = ordered.findIndex(episode => episode.id === currentEpisode.id);
  if (at < 0) {
    seekChapter(st, direction);
    return;
  }

  const target = ordered[at + direction];
  if (!target) {
    // Start/end of the show: staying put is less surprising than wrapping around.
    log.info('playback', 'track step at show boundary', { itemId, direction });
    return;
  }

  await playEpisode(st, show, target);
}
