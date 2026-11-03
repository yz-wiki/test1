// UI preference store tests.
//
// These preferences are read from more than one component, so the contract worth
// testing is the store itself: defaults, persistence, notification, and the DOM
// attribute that the CSS keys off.
import { describe, expect, it, beforeEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import {
  getSidebarVisible,
  setSidebarVisible,
  toggleSidebarVisible,
  getFocusRailMode,
  setFocusRailMode,
  toggleFocusRailMode,
  getReduceMotion,
  setReduceMotion,
  applyMotionPref,
  useSidebarVisible,
  useFocusRailMode,
  useReduceMotion,
  resetUiPrefsCache,
} from './uiPrefs';

describe('uiPrefs', () => {
  beforeEach(() => {
    localStorage.clear();
    resetUiPrefsCache();
    delete document.documentElement.dataset.motion;
  });

  describe('sidebar', () => {
    it('defaults to visible', () => {
      expect(getSidebarVisible()).toBe(true);
    });

    it('persists an explicit false and reads it back', () => {
      setSidebarVisible(false);
      expect(localStorage.getItem('skald.ui.sidebar')).toBe('false');
      resetUiPrefsCache();
      expect(getSidebarVisible()).toBe(false);
    });

    it('toggles between the two states', () => {
      toggleSidebarVisible();
      expect(getSidebarVisible()).toBe(false);
      toggleSidebarVisible();
      expect(getSidebarVisible()).toBe(true);
    });

    it('re-renders consumers when another surface changes it', () => {
      // This is the whole reason the preference is an external store rather than
      // useState: Settings → Appearance must update the shell's rendered value.
      const { result } = renderHook(() => useSidebarVisible());
      expect(result.current).toBe(true);
      act(() => { toggleSidebarVisible(); });
      expect(result.current).toBe(false);
    });
  });

  describe('focus rail', () => {
    it('defaults to auto so the shelf starts full width', () => {
      expect(getFocusRailMode()).toBe('auto');
    });

    it('persists an explicit mode', () => {
      setFocusRailMode('shown');
      expect(localStorage.getItem('skald.ui.focusRail')).toBe('shown');
      resetUiPrefsCache();
      expect(getFocusRailMode()).toBe('shown');
    });

    it('toggles hidden ⇄ shown without landing on auto', () => {
      toggleFocusRailMode();
      expect(getFocusRailMode()).toBe('hidden');
      toggleFocusRailMode();
      expect(getFocusRailMode()).toBe('shown');
    });

    it('re-renders consumers when the shelf toolbar toggles it', () => {
      const { result } = renderHook(() => useFocusRailMode());
      expect(result.current).toBe('auto');
      act(() => { toggleFocusRailMode(); });
      expect(result.current).toBe('hidden');
    });

    it('ignores an unrecognised stored value', () => {
      localStorage.setItem('skald.ui.focusRail', 'sideways');
      resetUiPrefsCache();
      expect(getFocusRailMode()).toBe('auto');
    });
  });

  describe('reduced motion', () => {
    it('defaults to off and stamps the document', () => {
      expect(getReduceMotion()).toBe(false);
      applyMotionPref();
      expect(document.documentElement.dataset.motion).toBe('full');
    });

    it('writes the attribute when enabled', () => {
      setReduceMotion(true);
      expect(localStorage.getItem('skald.ui.reduceMotion')).toBe('true');
      expect(document.documentElement.dataset.motion).toBe('reduced');
    });

    it('re-renders consumers and stamps the document', () => {
      const { result } = renderHook(() => useReduceMotion());
      expect(result.current).toBe(false);
      act(() => { setReduceMotion(true); });
      expect(result.current).toBe(true);
      expect(document.documentElement.dataset.motion).toBe('reduced');
    });

    it('restores the stored value on the next start', () => {
      localStorage.setItem('skald.ui.reduceMotion', 'true');
      resetUiPrefsCache();
      applyMotionPref();
      expect(document.documentElement.dataset.motion).toBe('reduced');
    });
  });
});
