// Small shared UI preferences.
//
// The sidebar's visibility is read in two places that are not ancestor/descendant
// of each other: the shell (which renders it) and Settings → Appearance (which
// offers the toggle). A `useState` in the shell would make the settings toggle a
// no-op until the next remount, so this is a tiny external store instead —
// `useSyncExternalStore` gives both readers a consistent, tear-free value and
// keeps localStorage as the single source of persistence.
import { useSyncExternalStore } from 'react';

const SIDEBAR_KEY = 'skald.ui.sidebar';

let cachedSidebar: boolean | null = null;
const listeners = new Set<() => void>();

function readSidebar(): boolean {
  try {
    return localStorage.getItem(SIDEBAR_KEY) !== 'false';
  } catch {
    // localStorage can throw in private mode; default to the richer layout.
    return true;
  }
}

export function getSidebarVisible(): boolean {
  if (cachedSidebar === null) cachedSidebar = readSidebar();
  return cachedSidebar;
}

export function setSidebarVisible(visible: boolean): void {
  cachedSidebar = visible;
  try { localStorage.setItem(SIDEBAR_KEY, String(visible)); } catch { /* ignore */ }
  listeners.forEach(listener => listener());
}

export function toggleSidebarVisible(): void {
  setSidebarVisible(!getSidebarVisible());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function useSidebarVisible(): boolean {
  return useSyncExternalStore(subscribe, getSidebarVisible, getSidebarVisible);
}

/** Test hook: drop the memoised value so a fresh localStorage read happens. */
export function resetUiPrefsCache(): void {
  cachedSidebar = null;
}
