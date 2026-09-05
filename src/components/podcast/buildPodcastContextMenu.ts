import type { LibraryItem, OnyxState } from '../../state/onyx';
import type { ContextMenuItem, ContextMenuSection } from '../ContextMenu';
import { rescanItem, deleteItem, deleteLocalPodcast, checkLocalNewEpisodes } from '../../api/abs';

// Right-click menu for a podcast in the podcast library (cluster E). Mirrors the
// audiobook menu's sectioned layout but with podcast-relevant actions — the key
// addition is Unsubscribe (which removes the podcast library item). Most actions
// require admin/update/delete permission on the server, so they're admin-gated.
export interface BuildPodcastContextMenuOpts {
  /** Navigate to the podcast detail screen. */
  openDetail: (id: string) => void;
  /** Open the episode download picker for this podcast. */
  setDownloadItem?: (item: LibraryItem) => void;
  /** Open the auto-download settings modal. */
  setSettingsItem?: (item: LibraryItem) => void;
  setCoverItem?: (item: LibraryItem) => void;
  setFilesItem?: (item: LibraryItem) => void;
  /** Called after a successful unsubscribe so the caller can clear selection. */
  onUnsubscribed?: (id: string) => void;
}

export function buildPodcastContextMenu(
  item: LibraryItem,
  st: OnyxState,
  opts: BuildPodcastContextMenuOpts,
): ContextMenuSection[] {
  const { openDetail, setDownloadItem, setSettingsItem, setCoverItem, setFilesItem, onUnsubscribed } = opts;
  // Local podcast libraries have no server permission model — the user fully owns
  // them, so the management actions are always available; ABS keeps admin-gating.
  const isLocal = st.activeLibrary?.source === 'local';
  const isAdmin = st.user?.type === 'root' || st.user?.type === 'admin';
  const canManage = isLocal || isAdmin;
  const title = item.media?.metadata?.title ?? '此播客';

  // ── PODCAST ────────────────────────────────────────────────────────────────
  const podcast: ContextMenuItem[] = [
    { label: '打开播客', icon: 'list', primary: true, onClick: () => openDetail(item.id) },
  ];
  if (canManage) {
    podcast.push(
      { label: '下载单集…', icon: 'download', onClick: () => setDownloadItem?.(item), disabled: !setDownloadItem },
      { label: '自动下载设置', icon: 'sliders', onClick: () => setSettingsItem?.(item), disabled: !setSettingsItem },
    );
  }

  const sections: ContextMenuSection[] = [{ label: '播客', items: podcast }];

  // ── MANAGE ──────────────────────────────────────────────────────────────────
  if (canManage) {
    const manage: ContextMenuItem[] = [];
    // Cover/Files use ABS server endpoints — only meaningful for ABS podcasts.
    if (!isLocal) {
      manage.push(
        { label: '更换封面', icon: 'image', onClick: () => setCoverItem?.(item), disabled: !setCoverItem },
        { label: '文件', icon: 'file', onClick: () => setFilesItem?.(item), disabled: !setFilesItem },
      );
    }
    manage.push({
      label: isLocal ? '检查新单集' : '重新扫描',
      icon: 'refresh',
      onClick: () => {
        const p = isLocal ? checkLocalNewEpisodes(item.id).then(() => st.refreshLibrary()) : rescanItem(st.serverUrl, item.id);
        p.then(() => st.setToast({ message: isLocal ? `已检查“${title}”是否有新单集` : `已开始重新扫描“${title}”`, type: 'success' }))
          .catch(e => st.setToast({ message: `失败：${String(e)}`, type: 'error' }));
      },
    });
    sections.push({ label: '管理', items: manage });

    // Unsubscribe sits in its own divided-off group, like the audiobook Delete.
    sections.push({
      items: [
        {
          label: '取消订阅',
          icon: 'trash',
          danger: true,
          onClick: () => {
            st.setConfirmDialog({
              title: `取消订阅“${title}”？`,
              message: isLocal
                ? '这会从你的书库中移除该播客，并删除已下载到本机的单集文件。此操作无法撤销。'
                : '这会从你的书库中移除该播客。如果服务器已开启删除文件，其下载的单集也会从磁盘删除。此操作无法撤销。',
              confirmLabel: '取消订阅',
              onConfirm: () => {
                const p = isLocal ? deleteLocalPodcast(item.id) : deleteItem(st.serverUrl, item.id);
                p.then(() => {
                    st.removeLibraryItem(item.id);
                    onUnsubscribed?.(item.id);
                    st.setToast({ message: `已取消订阅“${title}”`, type: 'success' });
                  })
                  .catch(e => st.setToast({ message: `取消订阅失败：${String(e)}`, type: 'error' }));
              },
            });
          },
        },
      ],
    });
  }

  return sections;
}
