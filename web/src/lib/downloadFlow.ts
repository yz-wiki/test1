/**
 * Downloading uses the configured destination without interrupting the user.
 *
 * A native folder dialog is only opened when no directory has been configured,
 * or when the caller explicitly asks for one ("Download to…"). The directory
 * is changed in Settings > Storage, or from the context menu. This keeps the
 * system picker for the one thing it is genuinely better at — browsing disks,
 * UNC shares and virtual folders — without showing it on every download.
 */
import { open } from '@tauri-apps/plugin-dialog';
import { getDownloadsDir, setDownloadsDir, type LibraryItem } from './ipc';
import { downloads } from './downloads.svelte';
import { t } from './i18n.svelte';

export async function beginDownload(
  item: LibraryItem,
  title: string,
  author: string,
  chooseDestination = false,
): Promise<void> {
  let current = '';
  try {
    current = await getDownloadsDir();
  } catch {
    current = '';
  }

  if (chooseDestination || !current) {
    const chosen = await open({
      directory: true,
      multiple: false,
      title: t('downloads.chooseDir'),
      defaultPath: current || undefined,
    });
    if (typeof chosen !== 'string') return;
    await setDownloadsDir(chosen);
  }

  await downloads.start(item, title, author);
}
