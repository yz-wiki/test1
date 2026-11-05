/**
 * Brand identity — the single source of truth for everything the user sees.
 *
 * `id` is deliberately NOT renamed. It is the technical identifier used by
 * localStorage keys, IPC events, the Tauri bundle id and the log file name.
 * Renaming it would silently drop every saved setting and the sign-in state
 * for existing installs. The rebrand is a presentation-layer change only.
 *
 * To rename the product again, edit `name` / `latin`; every window title,
 * titlebar, boot screen and About reference reads `app.name` from i18n, which
 * in turn is the only place these strings are surfaced.
 */
export const BRAND = {
  /** Single display name, used in every locale. */
  name: 'ADSplayer',
  latin: 'ADSplayer',
  /** Kept for diagnostics and the "formerly" line in About. */
  former: 'Xuting (formerly Skald)',
  /** Technical identifier — do not change. */
  id: 'skald',
  /** One-line description of what the mark depicts. */
  mark: 'An open page folding into a sound wave.',
} as const;

export type Brand = typeof BRAND;
