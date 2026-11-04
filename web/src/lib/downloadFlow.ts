/**
 * Downloading is always an explicit act with a chosen destination.
 *
 * The folder picker opens from wherever the download was requested — the book
 * screen or the shelf's context menu — and the choice becomes the new default,
 * so the second download does not re-ask the same question.
 */
import { open } from '@tauri-apps/plugin-dialog';
import { getDownloadsDir, setDownloadsDir, type LibraryItem } from './ipc';
import { downloads } from './downloads.svelte';
import { t } from './i18n.svelte';

export async function beginDownload(
  item: LibraryItem,
  title: string,
  author: string,
): Promise<void> {
  let current = '';
  try {
    current = await getDownloadsDir();
  } catch {
    current = '';
  }

  const chosen = await open({
    directory: true,
    multiple: false,
    title: t('downloads.chooseDir'),
    defaultPath: current || undefined,
  });
  if (typeof chosen !== 'string') return;

  await setDownloadsDir(chosen);
  await downloads.start(item, title, author);
}
