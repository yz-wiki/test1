import { useEffect } from 'react';
import type { OnyxState } from '../state/onyx';
import FocusPanel from '../components/FocusPanel';
// GreetingPane replaces FocusPanel in the left slot when nothing is playing.
import GreetingPane from '../components/greeting/GreetingPane';
import PickItUp from '../components/PickItUp';
import TopNav from '../components/chrome/TopNav';
import ShelfHeader from '../components/shelf/ShelfHeader';
import LibraryShelf from '../components/shelf/LibraryShelf';
import { SeriesView } from '../components/shelf/tabs';
import { AuthorsView } from '../components/shelf/tabs';
import { NarratorsView } from '../components/shelf/tabs';
import { CollectionsView } from '../components/shelf/tabs';
import { PlaylistsView } from '../components/shelf/tabs';
import { GenresView } from '../components/shelf/tabs';
import { PublishersView } from '../components/shelf/tabs';
import PodcastBrowse from '../components/podcast/PodcastBrowse';
import { prefetchReviews } from '../api/reviewCache';
import { shelfTabForSource } from '../lib/shelfTabs';
import { recentlyAddedItems } from '../lib/recentlyAdded';
import { log } from '../lib/log';
import { useFocusRailMode } from '../lib/uiPrefs';

export interface LibraryProps {
  st: OnyxState;
}

export default function Library({ st }: LibraryProps) {
  const isPodcast = st.activeLibrary?.mediaType === 'podcast';
  const isLocalLibrary = st.activeLibrary?.source === 'local';
  const isAllLibraries = st.activeLibrary?.source === 'all';
  // Combined + local sources route through the same gate: only the
  // library-scoped Collections/Playlists views fall back to Home; the
  // client-side browse tabs render for every source.
  const shelfSource = isAllLibraries ? 'all' : isLocalLibrary ? 'local' : 'abs';
  const visibleShelfTab = shelfTabForSource(st.shelfTab, shelfSource);
  const recentlyAdded = recentlyAddedItems(st.library);

  useEffect(() => {
    if (visibleShelfTab !== 'recently-added') return;
    log.info('library', 'recently added shelf opened', {
      source: shelfSource,
      items: recentlyAdded.length,
    });
  }, [visibleShelfTab, shelfSource, recentlyAdded.length]);

  useEffect(() => {
    // Open Library review enrichment is book-specific — skip it for podcasts.
    if (isPodcast || !st.library.length || !st.serverUrl) return;
    const cancel = prefetchReviews(st.library, st.serverUrl, st.enableOpenLibrary);
    return cancel;
  }, [st.library, st.serverUrl, st.enableOpenLibrary, isPodcast]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── The "In focus" left column (shared by the book + podcast views) ──────────
  // Top: FocusPanel when a *book* is playing in the active library, else the
  // GreetingPane (FocusPanel is book-specific, so podcasts always use Greeting).
  // The old per-screen MiniPlayer that used to dock under this card is gone: the
  // shell's persistent now-playing bar covers exactly the same case (playback
  // continuing while you browse elsewhere) without occupying shelf width.
  const playingIsPodcast = !!st.currentEpisode;
  const playingBookInLib = !!st.currentBookId && st.library.some(b => b.id === st.currentBookId);
  const showFocus = playingBookInLib && !playingIsPodcast;

  // The left column reserves 360px. In 'auto' it shows the Greeting pane only
  // while nothing from this library is playing: once playback starts, the shell's
  // now-playing bar is the single transport, so a second playback card here would
  // duplicate the cover, title and controls. 'shown' pins the panel (and brings
  // FocusPanel back), 'hidden' hands the width to the shelf.
  const focusRailMode = useFocusRailMode();
  const showFocusColumn = focusRailMode === 'shown' || (focusRailMode === 'auto' && !showFocus);

  const focusColumn = (
    <div style={{
      alignSelf: 'stretch',     // fill the cross-axis height of the Library flex container
      display: 'flex',
      flexDirection: 'column',
      flexShrink: 0,            // prevent width compression (same constraint as FocusPanel)
      minHeight: 0,
      // Cap at the Focus/Greeting card footprint (360) so a long nowrap episode
      // title in the MiniPlayer can't stretch the column's intrinsic width past
      // the card — the title then ellipsizes instead. maxWidth (not width) so
      // the collapsed FocusPanel rail (76px) still shrinks the column to fit.
      maxWidth: 340,
    }}>
      <div style={{ flex: 1, minHeight: 0, display: 'flex' }}>
        {showFocus
          ? <FocusPanel st={st} />
          : <GreetingPane st={st} name={st.user?.username || st.localDisplayName || 'Reader'} />}
      </div>
    </div>
  );

  // Podcast libraries use a dedicated browse grid instead of the book-centric
  // shelf-tabs, but share the same Focus/Greeting + MiniPlayer left column for
  // consistency. The library switcher in TopNav toggles between the two.
  if (isPodcast) {
    return (
      <div style={{ flex: 1, display: 'flex', gap: 'var(--s-5)', padding: 'var(--s-4) var(--s-6) var(--s-6)', minHeight: 0, width: '100%', maxWidth: '100%', overflow: 'visible' }}>
        {showFocusColumn && focusColumn}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 'var(--s-4)', minWidth: 0 }}>
          <TopNav st={st} />
          <PodcastBrowse st={st} />
        </div>
      </div>
    );
  }

  return (
    <div style={{ flex: 1, display: 'flex', gap: 'var(--s-5)', padding: 'var(--s-4) var(--s-6) var(--s-6)', minHeight: 0, width: '100%', maxWidth: '100%', overflow: 'visible' }}>
      {/* overflow: visible required — TopNav's tab indicator protrudes below the bar */}
      {showFocusColumn && focusColumn}

      {/* RIGHT — shelf column. minHeight:0 lets the flex:1 LibraryShelf shrink to
          the column height instead of growing to its (virtualized, very tall)
          content — without it the shelf's scroll container can resolve to a
          fragile/near-zero height, which the virtualizer then measures. */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 'var(--s-4)', minWidth: 0, minHeight: 0 }}>
        <TopNav st={st} />
        <PickItUp st={st} />
        <ShelfHeader st={st} />

        {/* Shelf body — routed by shelfTab */}
        {visibleShelfTab === 'library'     && <LibraryShelf    st={st} />}
        {visibleShelfTab === 'recently-added' && (
          <LibraryShelf st={st} items={recentlyAdded} sortMode="recently" groupBySeries={false} />
        )}
        {visibleShelfTab === 'series'      && <SeriesView      st={st} inline />}
        {visibleShelfTab === 'authors'     && <AuthorsView     st={st} inline />}
        {visibleShelfTab === 'narrators'   && <NarratorsView   st={st} inline />}
        {visibleShelfTab === 'genres'      && <GenresView      st={st} inline />}
        {visibleShelfTab === 'publishers'  && <PublishersView  st={st} inline />}
        {visibleShelfTab === 'collections' && <CollectionsView st={st} inline />}
        {visibleShelfTab === 'playlists'   && <PlaylistsView   st={st} inline />}
      </div>
    </div>
  );
}
