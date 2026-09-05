import { bookAuthor, type LibraryItem, type OnyxState, type MediaProgress } from '../../state/onyx';
import type { ContextMenuItem, ContextMenuSection } from '../ContextMenu';
import { updateProgress, deleteProgress, closeActiveSession, rescanItem, deleteItem, downloadItem, removeDownload, deleteLocalItem, setLocalProgress, seekAudio, pauseAudio } from '../../api/abs';
// Canonical play function — routes through shared resume and UI-sync logic
import { playBook } from '../../api/playbook';
import { log } from '../../lib/log';

// Guard against double-invocation (React portal event bubbling / StrictMode).
const pendingItems = new Set<string>();

// Builds the item right-click menu as labelled sections (PLAYBACK / ORGANIZE /
// MANAGE) with icons. The five admin "library tools" (edit / cover / match /
// files / re-scan) are collapsed into a single "Library tools" submenu.
type ItemSetter = (item: LibraryItem) => void;

export interface BuildItemContextMenuOpts {
  setMatchItem?: ItemSetter;
  setCollectionItem?: ItemSetter;
  setFilesItem?: ItemSetter;
  setPlaylistItem?: ItemSetter;
  setEditItem?: ItemSetter;
  setCoverItem?: ItemSetter;
  setShareItem?: ItemSetter;
  /** True only when the menu is opened from the Pick-it-up shelf — enables the
   *  "Remove from Pick it up" action, which is hidden on the main shelf. */
  fromPickItUp?: boolean;
}

export function buildItemContextMenu(
  item: LibraryItem,
  st: OnyxState,
  opts: BuildItemContextMenuOpts = {},
): ContextMenuSection[] {
  const {
    setMatchItem, setCollectionItem, setFilesItem, setPlaylistItem,
    setEditItem, setCoverItem, setShareItem, fromPickItUp,
  } = opts;
  const isAdmin = st.user?.type === 'root' || st.user?.type === 'admin';
  // Local-library items live on disk already (carry a localPath) — they get no
  // Download action, and their own Delete (files + catalog row) in Library tools.
  const isLocal = !!item.localPath;
  const isCombinedShelf = st.activeLibrary?.source === 'all';
  // Used to toggle the first menu item between Download and Delete Download.
  const existingDownload = st.downloads.find(d => d.itemId === item.id);

  // ── PLAYBACK ───────────────────────────────────────────────────────────────
  const playback: ContextMenuItem[] = [
    {
      label: '播放本书',
      icon: 'play',
      primary: true,
      onClick: async () => {
        const title = item.media?.metadata?.title ?? item.id;
        try {
          // Delegate session teardown, resume-position lookup, session open,
          // UI sync, and playAudio to the canonical playBook function.
          await playBook(st, item.id);
          st.setToast({ message: `正在播放“${title}”`, type: 'success' });
        } catch (e) {
          st.setToast({ message: `无法开始播放：${String(e)}`, type: 'error' });
        }
      },
    },
    // Download/Delete-Download only applies to server items — local books are
    // already on disk, so the action is omitted for them.
    ...(isLocal ? [] : [
      existingDownload
        ? {
            // Already downloaded — offer deletion so the user can free up space directly
            // from the shelf without navigating to Settings → Downloads.
            label: '删除下载',
            icon: 'trash',
            danger: true,
            onClick: () => {
              const title = item.media?.metadata?.title ?? item.id;
              st.setConfirmDialog({
                title: `删除“${title}”的下载副本？`,
                message: '这将从你的设备中移除本机音频文件。该书仍可从你的服务器在线收听。',
                confirmLabel: '删除',
                onConfirm: async () => {
                  try {
                    await removeDownload(item.id);
                    st.setDownloads(prev => prev.filter(d => d.itemId !== item.id));
                    st.setToast({ message: `已删除“${title}”的下载副本`, type: 'success' });
                  } catch (e) {
                    st.setToast({ message: `删除失败：${String(e)}`, type: 'error' });
                  }
                },
              });
            },
          }
        : {
            // Not yet downloaded — fires the Rust streaming command.
            label: '下载',
            icon: 'download',
            onClick: () => {
              const title = item.media?.metadata?.title ?? item.id;
              const author = bookAuthor(item);
              // ABS serves multi-file audiobooks as a zip archive at this endpoint.
              const fileName = `${title}.zip`;
              downloadItem(st.serverUrl, item.id, fileName, title, author)
                // Item id only — no local paths or titles in the log stream.
                .then(() => log.info('downloads', 'download completed', { itemId: item.id }))
                .catch(e => {
                  log.error('downloads', 'download failed', { itemId: item.id, err: String(e) });
                  st.setToast({ message: `下载失败：${String(e)}`, type: 'error' });
                });
            },
          },
    ] as ContextMenuItem[]),
    {
      label: '标记为已听完',
      icon: 'check-circle',
      onClick: async () => {
        if (pendingItems.has(item.id)) return;
        pendingItems.add(item.id);
        try {
          // Immediate optimistic update — UI responds before server round-trip.
          const existing = st.mediaProgress.find(p => p.libraryItemId === item.id);
          const optimistic: MediaProgress = {
            id: existing?.id ?? item.id,
            libraryItemId: item.id,
            episodeId: existing?.episodeId ?? null,
            duration: item.media.duration,
            progress: 1,
            currentTime: item.media.duration,
            isFinished: true,
            lastUpdate: Date.now(),
          };
          st.setMediaProgress(
            existing
              ? st.mediaProgress.map(p => p.libraryItemId === item.id ? optimistic : p)
              : [...st.mediaProgress, optimistic],
          );
          if (item.localPath) {
            // Local-library item — persist to the catalog (no server session).
            // If this is the item playing right now, move the playhead to the end and
            // pause first: the local playback tick has no session to close, so without
            // this it would converge back on the live (earlier) position and undo the
            // finished flag. Seeking to the end makes the tick agree it's complete.
            if (st.currentBookId === item.id) {
              await seekAudio(item.media.duration).catch(() => {});
              await pauseAudio().catch(() => {});
              st.setPlaying(false);
            }
            setLocalProgress(item.id, item.media.duration, item.media.duration, true)
              .catch(e => log.error('library', 'mark finished (local) failed', { itemId: item.id, err: String(e) }));
          } else {
            await closeActiveSession().catch(() => {}); // no-op if no session open
            st.setSessionReady(false); // force fresh session on next play
            st.setSessionId('');
            st.setPlaying(false);
            updateProgress(st.serverUrl, item.id, item.media.duration, item.media.duration, true)
              .catch(e => log.error('library', 'mark finished (server) failed', { itemId: item.id, err: String(e) }));
          }
        } catch (e) {
          log.error('library', 'mark finished failed', { itemId: item.id, err: String(e) });
        } finally {
          pendingItems.delete(item.id);
        }
      },
    },
  ];

  // "Remove from Pick it up" is only meaningful when the menu is opened from the
  // Pick-it-up shelf — right-clicking the same book on the main shelf omits it.
  if (fromPickItUp) {
    playback.push({
      label: '从“接着听”中移除',
      icon: 'clock',
      onClick: () => {
        // The DELETE endpoint requires the progress record's own id, not the library item id.
        const progressRecord = st.mediaProgress.find(p => p.libraryItemId === item.id);
        if (!progressRecord) {
          st.setToast({ message: '未找到这本书的进度记录。', type: 'info' });
          return;
        }
        const title = item.media?.metadata?.title ?? item.id;
        deleteProgress(st.serverUrl, progressRecord.id)
          .then(() => {
            st.setMediaProgress(st.mediaProgress.filter(p => p.id !== progressRecord.id));
            st.setToast({ message: `已从“接着听”中移除“${title}”`, type: 'success' });
          })
          .catch(e => st.setToast({ message: `移除失败：${String(e)}`, type: 'error' }));
      },
    });
  }

  // ── ORGANIZE ─────────────────────────────────────────────────────────────
  const organize: ContextMenuItem[] = isLocal || isCombinedShelf ? [] : [
    { label: '添加到播放列表', icon: 'playlist', onClick: () => setPlaylistItem?.(item), disabled: !setPlaylistItem },
  ];
  if (!isLocal && !isCombinedShelf && isAdmin) {
    organize.push({ label: '添加到合集', icon: 'layers', onClick: () => setCollectionItem?.(item), disabled: !setCollectionItem });
  }

  const sections: ContextMenuSection[] = [
    { label: '播放', items: playback },
  ];
  if (organize.length > 0) sections.push({ label: '整理', items: organize });

  // ── SOURCE (combined shelf only) ───────────────────────────────────────────
  // All Libraries deliberately exposes search/play only (review L1) — organize
  // and manage actions live in the item's source library. This jump makes that
  // boundary actionable instead of leaving Collections/Playlists mysteriously
  // absent. Mirrors TopNav's switch-reset, then focuses the book so it stays
  // front-and-center after landing in the source library.
  if (isCombinedShelf) {
    const sourceLib = st.libraries.find(l => l.id === item.libraryId);
    if (sourceLib) {
      sections.push({
        label: '来源',
        items: [{
          label: `在“${sourceLib.name}”中打开`,
          icon: 'grid',
          onClick: () => {
            log.info('library', 'open source library from combined shelf', { itemId: item.id, libraryId: sourceLib.id });
            st.setActiveLibrary(sourceLib.id).catch(e => log.error('library', 'source library switch failed', { id: sourceLib.id, err: String(e) }));
            st.setSearch('');
            st.setContextFilter(null);
            st.setShelfTab('library');
            st.setFocusedBookId(item.id);
          },
        }],
      });
    }
  }

  // ── MANAGE ─────────────────────────────────────────────────────────────────
  // Local-library items carry a localPath. Their manage tools differ from ABS:
  // Match and Edit Metadata are wired (both write the catalog + re-file on disk);
  // the rest (Cover/Re-Scan/Share/Delete) are still server-coupled, so they're
  // omitted for local items rather than shown broken. These are offered for local
  // items regardless of server-admin status, since a standalone local session has
  // no server user.
  if (isLocal) {
    sections.push({
      label: '管理',
      items: [
        {
          label: '书库工具',
          icon: 'sliders',
          submenu: [
            { label: '编辑元数据', icon: 'edit', onClick: () => setEditItem?.(item), disabled: !setEditItem },
            { label: '匹配元数据', icon: 'target', onClick: () => setMatchItem?.(item), disabled: !setMatchItem },
            {
              label: '删除',
              icon: 'trash',
              danger: true,
              onClick: () => {
                const title = item.media?.metadata?.title ?? '这本书';
                st.setConfirmDialog({
                  title: `删除“${title}”？`,
                  message: '这将永久删除本书及其在本设备上的文件，且无法撤销。',
                  confirmLabel: '删除',
                  onConfirm: () => {
                    deleteLocalItem(item.id)
                      .then(() => {
                        st.removeLibraryItem(item.id);
                        st.setToast({ message: `已删除“${title}”`, type: 'success' });
                      })
                      .catch(e => st.setToast({ message: `删除失败：${String(e)}`, type: 'error' }));
                  },
                });
              },
            },
          ],
        },
      ],
    });
  } else if (isAdmin) {
    sections.push({
      label: '管理',
      items: [
        { label: '分享与发布…', icon: 'share', onClick: () => setShareItem?.(item), disabled: !setShareItem },
        {
          label: '书库工具',
          icon: 'sliders',
          submenu: [
            { label: '编辑元数据', icon: 'edit', onClick: () => setEditItem?.(item), disabled: !setEditItem },
            { label: '更换封面', icon: 'image', onClick: () => setCoverItem?.(item), disabled: !setCoverItem },
            { label: '匹配元数据', icon: 'target', onClick: () => setMatchItem?.(item), disabled: !setMatchItem },
            { label: '文件', icon: 'file', onClick: () => setFilesItem?.(item), disabled: !setFilesItem },
            {
              label: '重新扫描',
              icon: 'refresh',
              onClick: () => {
                const title = item.media?.metadata?.title ?? item.id;
                rescanItem(st.serverUrl, item.id)
                  .then(() => st.setToast({ message: `已开始重新扫描“${title}”`, type: 'success' }))
                  .catch(e => st.setToast({ message: `重新扫描失败：${String(e)}`, type: 'error' }));
              },
            },
          ],
        },
      ],
    });

    // Delete sits in its own unlabelled group so it's divided off from the rest.
    sections.push({
      items: [
        {
          label: '删除',
          icon: 'trash',
          danger: true,
          onClick: () => {
            const title = item.media?.metadata?.title ?? '这个条目';
            st.setConfirmDialog({
              title: `删除“${title}”`,
              message: '这将从服务器上永久移除该条目。若服务器已启用文件删除，音频文件也会一并从磁盘删除。此操作无法撤销。',
              confirmLabel: '删除',
              onConfirm: () => {
                deleteItem(st.serverUrl, item.id)
                  .then(() => {
                    st.removeLibraryItem(item.id);
                    st.setToast({ message: `已删除“${title}”`, type: 'success' });
                  })
                  .catch(e => st.setToast({ message: `删除失败：${String(e)}`, type: 'error' }));
              },
            });
          },
        },
      ],
    });
  }

  return sections;
}
