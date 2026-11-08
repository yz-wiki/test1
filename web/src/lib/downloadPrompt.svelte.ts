/**
 * The single "where should this download go?" question.
 *
 * Every download entry point (book page, shelf context menu) now goes through
 * this store. The app asks once, in its own styled dialog, and only opens the
 * native folder picker when the user actually wants a different destination.
 * That replaces the old split of "Download" (silent, default dir) and
 * "Download to…" (silently changed the global default and migrated every
 * existing download).
 */
import { open } from '@tauri-apps/plugin-dialog';
import { getDownloadsDir, setDownloadsDir } from './ipc';
import { t } from './i18n.svelte';

export interface DownloadQuestion {
  title: string;
  dir: string;
}

export type DownloadChoice = 'default' | 'custom' | null;

class DownloadPromptStore {
  question = $state<DownloadQuestion | null>(null);
  error = $state<string | null>(null);
  private resolve: ((value: DownloadChoice) => void) | null = null;

  /** Resolves to 'default', 'custom', or null when the user cancels. */
  ask(title: string): Promise<DownloadChoice> {
    return new Promise(resolve => {
      this.resolve = resolve;
      this.error = null;
      void getDownloadsDir()
        .then(dir => (this.question = { title, dir: dir || '' }))
        .catch(() => (this.question = { title, dir: '' }));
    });
  }

  useDefault(): void {
    this.finish('default');
  }

  /** Native picker only on demand. The chosen directory becomes the new
   *  default: the Rust registry and its containment guards are all rooted at
   *  one directory, so a one-off destination needs backend support first. */
  async chooseCustom(): Promise<void> {
    const current = this.question?.dir;
    try {
      const chosen = await open({
        directory: true,
        multiple: false,
        title: t('downloads.chooseDir'),
        defaultPath: current || undefined,
      });
      if (typeof chosen !== 'string') return; // picker cancelled: keep asking
      await setDownloadsDir(chosen);
      this.finish('custom');
    } catch (reason) {
      this.error = (reason as Error).message;
    }
  }

  cancel(): void {
    this.finish(null);
  }

  private finish(value: DownloadChoice): void {
    this.question = null;
    this.error = null;
    const resolve = this.resolve;
    this.resolve = null;
    resolve?.(value);
  }
}

export const downloadPrompt = new DownloadPromptStore();
