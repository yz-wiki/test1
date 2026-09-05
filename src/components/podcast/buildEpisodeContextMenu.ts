import type { LibraryItem, OnyxState, MediaProgress } from '../../state/onyx';
import type { ContextMenuItem, ContextMenuSection } from '../ContextMenu';
import type { PodcastEpisode } from '../../api/abs';
import {
  updateProgress, setLocalProgress, deleteEpisode, deleteLocalEpisode,
  closeActiveSession, seekAudio, pauseAudio,
} from '../../api/abs';
import { log } from '../../lib/log';

// Right-click menu for a single podcast EPISODE (Podcast Episode Context Menu
// roadmap) — the row-level counterpart of buildPodcastContextMenu's show-level
// menu. Shared by the PodcastDetail episode list and the PodcastBrowse feed.
// Mirrors the audiobook menu's sectioned layout (PLAYBACK / ORGANIZE / delete
// group); deliberately excluded: Add to Collection (ABS collections are
// book-only), Share (episode share links are a deferred cluster G roadmap),
// and Edit Episode Metadata (deferred cluster E UI).

// Guard against double-invocation (React portal event bubbling / StrictMode) —
// same pattern as buildItemContextMenu, keyed per (item, episode).
const pendingEpisodes = new Set<string>();

export interface BuildEpisodeContextMenuOpts {
  /** Play a downloaded episode (the surface's existing play path — navigates
   *  to the player only after playback actually starts). */
  play: (ep: PodcastEpisode) => void;
  /** Open the player in its download-then-play state for a feed episode. */
  openUndownloaded: (ep: PodcastEpisode) => void;
  /** Open the Add-to-Playlist picker for this episode (ABS libraries only —
   *  the local catalog has no playlists). */
  setPlaylistEpisode?: (item: LibraryItem, ep: PodcastEpisode) => void;
  /** Called after a successful delete so the surface can refresh its lists. */
  onDeleted?: (ep: PodcastEpisode) => void;
}

export function buildEpisodeContextMenu(
  item: LibraryItem,
  ep: PodcastEpisode,
  downloaded: boolean,
  st: OnyxState,
  opts: BuildEpisodeContextMenuOpts,
): ContextMenuSection[] {
  // Local podcast libraries have no server permission model — the user fully
  // owns them; ABS keeps admin-gating (matches the show-level menu).
  const isLocal = st.activeLibrary?.source === 'local';
  const isAdmin = st.user?.type === 'root' || st.user?.type === 'admin';
  const canManage = isLocal || isAdmin;
  // Feed-only episodes carry no id — nothing exists on the server or disk to
  // finish/playlist/delete, so their menu shrinks to the download action.
  const hasId = !!ep.id;
  const nowPlaying = hasId && st.currentBookId === item.id && st.currentEpisodeId === ep.id;
  const mp = hasId
    ? st.mediaProgress.find(p => p.libraryItemId === item.id && p.episodeId === ep.id)
    : undefined;
  const dur = ep.duration ?? mp?.duration ?? 0;

  // ── PLAYBACK ───────────────────────────────────────────────────────────────
  const playback: ContextMenuItem[] = [
    downloaded && hasId
      ? { label: '播放本集', icon: 'play', primary: true, onClick: () => opts.play(ep) }
      : { label: '下载并播放', icon: 'download', primary: true, onClick: () => opts.openUndownloaded(ep) },
  ];

  if (downloaded && hasId) {
    const finished = mp?.isFinished ?? false;
    playback.push({
      label: finished ? '标记为未听完' : '标记为已听完',
      icon: 'check-circle',
      onClick: async () => {
        const key = `${item.id}|${ep.id}`;
        if (pendingEpisodes.has(key)) return;
        pendingEpisodes.add(key);
        try {
          // Optimistic update first — the row's finished/progress chip responds
          // before the write round-trip (same pattern as the book menu).
          const optimistic: MediaProgress = {
            id: mp?.id ?? `${item.id}-${ep.id}`,
            libraryItemId: item.id,
            episodeId: ep.id!,
            duration: dur,
            progress: finished ? 0 : 1,
            currentTime: finished ? 0 : dur,
            isFinished: !finished,
            lastUpdate: Date.now(),
          };
          st.setMediaProgress(
            mp
              ? st.mediaProgress.map(p => (p.libraryItemId === item.id && p.episodeId === ep.id ? optimistic : p))
              : [...st.mediaProgress, optimistic],
          );
          if (!finished && nowPlaying) {
            // Finishing the episode that is playing right now: park the playhead
            // at the end and pause, otherwise the 1-second tick converges back on
            // the live (earlier) position and silently undoes the finished flag
            // (same fix as the book menu's Mark as Finished).
            if (isLocal) {
              await seekAudio(dur).catch(() => {});
              await pauseAudio().catch(() => {});
            } else {
              await closeActiveSession().catch(() => {}); // no-op if no session open
              st.setSessionReady(false);
              st.setSessionId('');
            }
            st.setPlaying(false);
          }
          const write = isLocal
            ? setLocalProgress(item.id, finished ? 0 : dur, dur, !finished, ep.id)
            : updateProgress(st.serverUrl, item.id, finished ? 0 : dur, dur, !finished, ep.id);
          write.catch(e => log.error('library', 'episode finished toggle failed', { itemId: item.id, episodeId: ep.id, err: String(e) }));
        } finally {
          pendingEpisodes.delete(key);
        }
      },
    });
  }

  const sections: ContextMenuSection[] = [{ label: '播放', items: playback }];

  // ── ORGANIZE ─────────────────────────────────────────────────────────────
  // ABS playlists support podcast episodes (PlaylistItemInput.episodeId); the
  // local catalog has no playlists, so the section is omitted for local.
  if (!isLocal && downloaded && hasId) {
    sections.push({
      label: '整理',
      items: [
        {
          label: '添加到播放列表',
          icon: 'playlist',
          onClick: () => opts.setPlaylistEpisode?.(item, ep),
          disabled: !opts.setPlaylistEpisode,
        },
      ],
    });
  }

  // ── Delete (own divided-off group, like the book menu) ────────────────────
  if (canManage && downloaded && hasId) {
    // A locally-playing episode's file is held open by LibVLC (Windows sharing
    // violation on delete), and there is no stop-and-release primitive — so the
    // action is disabled while this episode plays. ABS deletes are server-side;
    // the session is closed first instead.
    const blockedByPlayback = isLocal && nowPlaying;
    sections.push({
      items: [
        {
          label: blockedByPlayback ? '删除单集（播放中）' : '删除单集',
          icon: 'trash',
          danger: true,
          disabled: blockedByPlayback,
          onClick: () => {
            st.setConfirmDialog({
              title: `删除“${ep.title}”？`,
              message: isLocal
                ? '这将删除本机已下载的音频文件。该单集仍保留在订阅源中，之后可以重新下载。'
                : '这会从服务器移除该单集，并删除服务器磁盘上的音频文件。此操作无法撤销。',
              confirmLabel: '删除',
              onConfirm: async () => {
                try {
                  if (nowPlaying && !isLocal) {
                    // Streaming the episode being deleted — tear the session down
                    // first so the player isn't left syncing a deleted item.
                    await closeActiveSession().catch(() => {});
                    st.setSessionReady(false);
                    st.setSessionId('');
                    st.setPlaying(false);
                    await pauseAudio().catch(() => {});
                  }
                  if (isLocal) {
                    await deleteLocalEpisode(item.id, ep.id!);
                  } else {
                    // hard=1: also remove the audio file from the server's disk —
                    // matches what "delete" means to the user (freeing space).
                    await deleteEpisode(st.serverUrl, item.id, ep.id!, true);
                  }
                  // Drop the episode's progress from UI state so a re-download
                  // starts clean (the backend cleared its persisted row too).
                  st.setMediaProgress(st.mediaProgress.filter(p => !(p.libraryItemId === item.id && p.episodeId === ep.id)));
                  opts.onDeleted?.(ep);
                  st.setToast({ message: `已删除单集“${ep.title}”`, type: 'success' });
                  log.info('library', 'episode deleted', { itemId: item.id, episodeId: ep.id, local: isLocal });
                } catch (e) {
                  log.error('library', 'episode delete failed', { itemId: item.id, episodeId: ep.id, err: String(e) });
                  st.setToast({ message: `删除失败：${String(e)}`, type: 'error' });
                }
              },
            });
          },
        },
      ],
    });
  }

  return sections;
}
