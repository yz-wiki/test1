/**
 * One download path for the whole app.
 *
 * Every entry point asks the same destination question before a byte moves.
 * The native folder picker only opens when the user asks for a different
 * location; the default path is a single click. This replaces the old split
 * between a silent "Download" and "Download to…" that quietly rewrote the
 * global download directory (and migrated existing downloads with it).
 *
 * Book page and shelf context menu both call this, so the two can never
 * disagree about where a file went.
 */
import { type LibraryItem } from './ipc';
import { downloads } from './downloads.svelte';
import { downloadPrompt } from './downloadPrompt.svelte';

export async function beginDownload(
  item: LibraryItem,
  title: string,
  author: string,
): Promise<void> {
  const choice = await downloadPrompt.ask(title);
  if (!choice) return;
  await downloads.start(item, title, author);
}
