/**
 * One definition of "back".
 *
 * The rail button, the Esc shortcut and the in-place group breadcrumb all
 * unwind the same stack: open popovers first (they own their own Esc), then
 * the expanded player, then a drilled-down group, then a detail route, then
 * a search, and finally the dashboard. Returning false means there was
 * nothing to unwind, so the key is left alone for the browser / focused
 * control instead of being swallowed.
 */
import { ui } from './state.svelte';
import { player } from './player.svelte';

const OPEN_LAYER =
  '[aria-expanded="true"], [role="dialog"], [role="menu"], [role="listbox"]';

export function goBack(): boolean {
  // A popover owns Esc. Without this guard, closing the device picker would
  // also navigate away from whatever page was underneath it.
  if (document.querySelector(OPEN_LAYER)) return false;

  if (player.expanded) {
    player.collapse();
    return true;
  }

  if (ui.focusGroup) {
    ui.focusGroup = null;
    return true;
  }

  if (ui.route === 'book' || ui.route === 'podcast') {
    ui.itemId = null;
    ui.route = 'library';
    return true;
  }

  if (ui.route !== 'library') {
    ui.route = 'library';
    return true;
  }

  if (ui.query.trim()) {
    ui.query = '';
    return true;
  }

  if (ui.libraryView !== 'home') {
    ui.setLibraryView('home');
    return true;
  }

  return false;
}
