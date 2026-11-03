// Theme token palette — fields match the CSS custom properties on :root in index.css.
// applyTheme writes every value directly to the DOM; no JS object is ever mutated.
export type Theme = {
  bg: string;
  bgDeep: string;
  panel: string;
  panel2: string;
  line: string;
  text: string;
  textDim: string;
  textMute: string;
  glass: string;
  glassStrong: string;
  glassEdge: string;
  isDark: boolean;
};

// ─── Palettes ────────────────────────────────────────────────────────────────
//
// Retuned to the macOS surface model: neutral greys with a single deliberate
// temperature, one step per elevation level, and separators that are never pure
// black/white. The previous "Onyx" palette leaned warm-neutral (#0b0b0e /
// #ebe7df); these values keep the gold accent readable while sitting much closer
// to a native window, which is what the shell chrome (src/styles/macos.css)
// samples from.

export const ONYX_DARK_BASE: Theme = {
  bg:          '#1c1c1e',  // window background — macOS dark window grey
  bgDeep:      '#141416',  // behind-panel gutters, scrim base
  panel:       '#232326',  // panel surface (one elevation above the window)
  panel2:      '#2c2c2e',  // elevated surface: menus, popovers, sheets
  line:        'rgba(255,255,255,0.09)',
  text:        '#f2f2f5',  // never pure #fff — avoids halation on dark greys
  textDim:     'rgba(242,242,245,0.62)',
  textMute:    'rgba(242,242,245,0.38)',
  glass:       'rgba(255,255,255,0.05)',
  glassStrong: 'rgba(255,255,255,0.09)',
  glassEdge:   'rgba(255,255,255,0.10)',
  isDark:      true,
};

// Folio — cool-neutral light theme (macOS light window), not paper-warm.
export const ONYX_FOLIO_BASE: Theme = {
  bg:          '#f5f5f7',
  bgDeep:      '#ececf0',
  panel:       '#ffffff',
  panel2:      '#f7f7f9',
  line:        'rgba(0,0,0,0.09)',
  text:        '#1d1d1f',
  textDim:     'rgba(29,29,31,0.62)',
  textMute:    'rgba(29,29,31,0.40)',
  glass:       'rgba(255,255,255,0.62)',
  glassStrong: 'rgba(255,255,255,0.82)',
  glassEdge:   'rgba(0,0,0,0.10)',
  isDark:      false,
};

// ─── Theme presets ───────────────────────────────────────────────────────────
//
// More than "dark or light": each preset is a complete surface palette. The
// first two are the originals and stay the defaults; the others are deliberately
// distinct so switching is visible at a glance rather than a nudge in warmth.
export interface ThemePreset { id: string; label: string; isDark: boolean; palette: Theme }

export const THEME_PRESETS: ThemePreset[] = [
  { id: 'dark', label: 'Onyx', isDark: true, palette: ONYX_DARK_BASE },
  { id: 'light', label: 'Folio', isDark: false, palette: ONYX_FOLIO_BASE },
  {
    id: 'midnight', label: 'Midnight', isDark: true,
    palette: {
      bg: '#16161f', bgDeep: '#101018', panel: '#1e1e2a', panel2: '#262636',
      line: 'rgba(255,255,255,0.09)',
      text: '#e9e9f4', textDim: 'rgba(233,233,244,0.62)', textMute: 'rgba(233,233,244,0.36)',
      glass: 'rgba(255,255,255,0.05)', glassStrong: 'rgba(255,255,255,0.09)', glassEdge: 'rgba(255,255,255,0.10)',
      isDark: true,
    },
  },
  {
    id: 'nord', label: 'Nord', isDark: true,
    palette: {
      bg: '#2e3440', bgDeep: '#272c36', panel: '#3b4252', panel2: '#434c5e',
      line: 'rgba(255,255,255,0.10)',
      text: '#eceff4', textDim: 'rgba(236,239,244,0.66)', textMute: 'rgba(236,239,244,0.40)',
      glass: 'rgba(255,255,255,0.06)', glassStrong: 'rgba(255,255,255,0.10)', glassEdge: 'rgba(255,255,255,0.12)',
      isDark: true,
    },
  },
  {
    id: 'sepia', label: 'Sepia', isDark: false,
    palette: {
      bg: '#f4efe4', bgDeep: '#ebe4d4', panel: '#fbf7ee', panel2: '#f1ead9',
      line: 'rgba(58,49,38,0.12)',
      text: '#3a3126', textDim: 'rgba(58,49,38,0.66)', textMute: 'rgba(58,49,38,0.42)',
      glass: 'rgba(255,252,245,0.66)', glassStrong: 'rgba(255,252,245,0.86)', glassEdge: 'rgba(58,49,38,0.12)',
      isDark: false,
    },
  },
];

/** Palette for a stored theme id. Unknown ids fall back to the dark default so a
 *  removed preset can never leave the window unstyled. */
export function themeBaseFor(mode: string): Theme {
  return THEME_PRESETS.find(preset => preset.id === mode)?.palette ?? ONYX_DARK_BASE;
}

// ─── Accent presets ──────────────────────────────────────────────────────────
//
// The macOS system colour set, plus Skald's own gold as the brand default. Kept
// here (rather than in the Appearance pane) so both the picker and any future
// theme-aware surface read from one list.
export interface AccentPreset { id: string; hex: string; labelKey: string }

export const ACCENT_PRESETS: AccentPreset[] = [
  { id: 'gold',   hex: '#d4a64a', labelKey: 'Skald Gold' },
  { id: 'blue',   hex: '#0a84ff', labelKey: 'Blue' },
  { id: 'purple', hex: '#bf5af2', labelKey: 'Purple' },
  { id: 'pink',   hex: '#ff375f', labelKey: 'Pink' },
  { id: 'red',    hex: '#ff453a', labelKey: 'Red' },
  { id: 'orange', hex: '#ff9f0a', labelKey: 'Orange' },
  { id: 'green',  hex: '#32d74b', labelKey: 'Green' },
  { id: 'graphite', hex: '#8e8e93', labelKey: 'Graphite' },
];


// ─── Color helpers ────────────────────────────────────────────────────────────

export function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const h = hex.replace('#', '');
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  };
}

export function lightenHex(hex: string, amount: number): string {
  const h = hex.replace('#', '');
  const lift = (c: string) =>
    Math.min(255, parseInt(c, 16) + Math.round(255 * amount))
      .toString(16)
      .padStart(2, '0');
  return `#${lift(h.slice(0, 2))}${lift(h.slice(2, 4))}${lift(h.slice(4, 6))}`;
}

// ─── Core functions ───────────────────────────────────────────────────────────

const root = () => document.documentElement;

export function setAccentColor(hex: string): void {
  const { r, g, b } = hexToRgb(hex);
  root().style.setProperty('--onyx-accent',   hex);
  root().style.setProperty('--onyx-accent-r', String(r));
  root().style.setProperty('--onyx-accent-g', String(g));
  root().style.setProperty('--onyx-accent-b', String(b));
}

export function applyTheme(theme: Theme, accentHex: string): void {
  const s = root().style;

  // Base palette tokens
  s.setProperty('--onyx-bg',           theme.bg);
  s.setProperty('--onyx-bg-deep',      theme.bgDeep);
  s.setProperty('--onyx-panel',        theme.panel);
  s.setProperty('--onyx-panel2',       theme.panel2);
  s.setProperty('--onyx-line',         theme.line);
  s.setProperty('--onyx-text',         theme.text);
  s.setProperty('--onyx-text-dim',     theme.textDim);
  s.setProperty('--onyx-text-mute',    theme.textMute);
  s.setProperty('--onyx-glass',        theme.glass);
  s.setProperty('--onyx-glass-strong', theme.glassStrong);
  s.setProperty('--onyx-glass-edge',   theme.glassEdge);

  // Derived accent tokens (alphas differ between dark and light)
  const accentDimAlpha  = theme.isDark ? 0.18 : 0.16;
  const accentEdgeAlpha = theme.isDark ? 0.35 : 0.45;
  const { r, g, b } = hexToRgb(accentHex);
  s.setProperty('--onyx-accent-bright', lightenHex(accentHex, 0.08));
  s.setProperty('--onyx-accent-dim',  `rgba(${r},${g},${b},${accentDimAlpha})`);
  s.setProperty('--onyx-accent-edge', `rgba(${r},${g},${b},${accentEdgeAlpha})`);

  // Propagate background/text to html and body so the window chrome matches
  // before React hydrates (mirrors what the prototype does in applyTheme).
  root().style.background        = theme.bg;
  document.body.style.background = theme.bg;
  document.body.style.color      = theme.text;

  // The macOS surface layer (src/styles/macos.css) keys its fills off this
  // attribute instead of duplicating every colour: one switch here keeps the
  // sidebar/titlebar/sheets in step with the palette above.
  root().dataset.appearance = theme.isDark ? 'dark' : 'light';

  setAccentColor(accentHex);
}

// ─── System theme listener ────────────────────────────────────────────────────

// Registers a prefers-color-scheme listener that re-applies the correct base
// palette whenever the OS switches mode. Call this only when the user's theme
// preference is 'system'. Returns a cleanup function.
export function watchSystemTheme(getAccent: () => string): () => void {
  const mq = window.matchMedia('(prefers-color-scheme: dark)');
  const handler = () => {
    const base = mq.matches ? ONYX_DARK_BASE : ONYX_FOLIO_BASE;
    applyTheme(base, getAccent());
  };
  mq.addEventListener('change', handler);
  return () => mq.removeEventListener('change', handler);
}
