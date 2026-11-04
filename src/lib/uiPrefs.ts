// Small shared UI preferences.
//
// Two of these are read from more than one place that is not an ancestor /
// descendant pair — the shell renders the sidebar but Settings offers its
// toggle, and the Library screen lays out the focus column while ShelfHeader
// offers the toggle. A `useState` would make the remote toggle a no-op until the
// next remount, so each preference is a tiny external store instead:
// `useSyncExternalStore` gives every reader the same tear-free value and keeps
// localStorage as the single source of persistence.
import { useEffect, useSyncExternalStore } from 'react';

interface StoredPref<T> {
  get: () => T;
  set: (value: T) => void;
  subscribe: (listener: () => void) => () => void;
  reset: () => void;
}

/** One localStorage-backed value with a memoised read and a subscriber set. */
function createStoredPref<T>(key: string, fallback: T, decode: (raw: string | null) => T): StoredPref<T> {
  let cached: T;
  let loaded = false;
  const listeners = new Set<() => void>();

  const get = (): T => {
    if (!loaded) {
      try {
        cached = decode(localStorage.getItem(key));
      } catch {
        // localStorage can throw in private mode; fall back rather than crash.
        cached = fallback;
      }
      loaded = true;
    }
    return cached;
  };

  const set = (value: T): void => {
    cached = value;
    loaded = true;
    try { localStorage.setItem(key, String(value)); } catch { /* ignore */ }
    listeners.forEach(listener => listener());
  };

  const subscribe = (listener: () => void): (() => void) => {
    listeners.add(listener);
    return () => { listeners.delete(listener); };
  };

  const reset = (): void => { loaded = false; };

  return { get, set, subscribe, reset };
}

// ─── Sidebar visibility ──────────────────────────────────────────────────────

const sidebarPref = createStoredPref('skald.ui.sidebar', true, raw => raw !== 'false');

export const getSidebarVisible = sidebarPref.get;
export const setSidebarVisible = sidebarPref.set;

export function toggleSidebarVisible(): void {
  setSidebarVisible(!getSidebarVisible());
}

export function useSidebarVisible(): boolean {
  return useSyncExternalStore(sidebarPref.subscribe, sidebarPref.get, sidebarPref.get);
}

// ─── Sidebar compact (icon rail) ─────────────────────────────────────────────
//
// The sidebar is always present; the toggle narrows it to an icon rail instead of
// removing it. Hiding it entirely made the library switcher and the account entry
// point disappear, which is not a trade any of the macOS-style apps make.

const sidebarCompactPref = createStoredPref('skald.ui.sidebarCompact', false, raw => raw === 'true');

export function getSidebarCompact(): boolean {
  return sidebarCompactPref.get();
}

export function setSidebarCompact(compact: boolean): void {
  sidebarCompactPref.set(compact);
}

export function toggleSidebarCompact(): void {
  setSidebarCompact(!getSidebarCompact());
}

export function useSidebarCompact(): boolean {
  return useSyncExternalStore(sidebarCompactPref.subscribe, sidebarCompactPref.get, sidebarCompactPref.get);
}

// ─── Library focus column ────────────────────────────────────────────────────
//
// 'auto'   — show the panel only while nothing is playing here. While playback
//            runs, the shell's now-playing bar is the single transport, so the
//            column would be a second copy of the same controls.
// 'shown'  — always reserve it, restoring the original always-on layout.
// 'hidden' — never show it; the shelf takes the full width.

export type FocusRailMode = 'auto' | 'shown' | 'hidden';

const focusRailPref = createStoredPref<FocusRailMode>(
  'skald.ui.focusRail',
  'auto',
  raw => (raw === 'shown' || raw === 'hidden' ? raw : 'auto'),
);

export const getFocusRailMode = focusRailPref.get;
export const setFocusRailMode = focusRailPref.set;

export function useFocusRailMode(): FocusRailMode {
  return useSyncExternalStore(focusRailPref.subscribe, focusRailPref.get, focusRailPref.get);
}

/** The shelf-toolbar toggle: visible → hidden, hidden → visible. */
export function toggleFocusRailMode(): void {
  setFocusRailMode(getFocusRailMode() === 'hidden' ? 'shown' : 'hidden');
}

// ─── Reduced motion ──────────────────────────────────────────────────────────
//
// Mirrors the OS setting when the user has not overridden it, and lets them force
// it on from Settings → Appearance. The DOM attribute is what the CSS keys off
// (`html[data-motion="reduced"]`), because the media query alone cannot express
// "reduced by choice on a machine that has animations enabled".

const reduceMotionPref = createStoredPref<boolean>(
  'skald.ui.reduceMotion',
  false,
  raw => raw === 'true',
);

export function getReduceMotion(): boolean {
  return reduceMotionPref.get();
}

/** Write the preference to the document. Safe to call before React mounts. */
export function applyMotionPref(): void {
  if (typeof document === 'undefined') return;
  document.documentElement.dataset.motion = getReduceMotion() ? 'reduced' : 'full';
}

export function setReduceMotion(on: boolean): void {
  reduceMotionPref.set(on);
  applyMotionPref();
}

export function useReduceMotion(): boolean {
  const value = useSyncExternalStore(reduceMotionPref.subscribe, reduceMotionPref.get, reduceMotionPref.get);
  // Keep the attribute in step with whichever surface changed the value. Done in
  // an effect rather than during render: writing to <html> is a side effect.
  useEffect(() => { applyMotionPref(); }, [value]);
  return value;
}

// ─── Minimise to tray ────────────────────────────────────────────────────────
//
// The window is undecorated, so a minimised one has no taskbar button and no
// way back except the tray icon. Default on: that is what "minimise" means for a
// background audio app. Turning it off restores a normal taskbar minimise.

const minimizeToTrayPref = createStoredPref('skald.ui.minimizeToTray', true, raw => raw !== 'false');

export function getMinimizeToTray(): boolean {
  return minimizeToTrayPref.get();
}

export function setMinimizeToTray(on: boolean): void {
  minimizeToTrayPref.set(on);
}

export function useMinimizeToTray(): boolean {
  return useSyncExternalStore(minimizeToTrayPref.subscribe, minimizeToTrayPref.get, minimizeToTrayPref.get);
}

// ─── Test hook ───────────────────────────────────────────────────────────────

/** Drop memoised values so a fresh localStorage read happens (tests only). */
export function resetUiPrefsCache(): void {
  sidebarPref.reset();
  sidebarCompactPref.reset();
  focusRailPref.reset();
  reduceMotionPref.reset();
  minimizeToTrayPref.reset();
}
