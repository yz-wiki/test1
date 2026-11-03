// Lightweight i18n runtime.
//
// Deliberately dependency-free: Skald ships a single bundle into a WebView, so a
// full i18next-style runtime (plugins, backends, namespaces, suspense) would add
// weight for no benefit at two locales. What it does provide is the part that
// actually matters in practice:
//
//   • compile-time key safety   — `Dict` is `Record<TranslationKey, string>`, so a
//                                 locale file that forgets a key fails typecheck
//   • interpolation             — `t('search.placeholder', { count: 42 })`
//   • CLDR-style plurals        — `t('toast.syncFlushed', { count })` resolves to
//                                 `_one` / `_other` from the count
//   • locale-aware formatting   — dates and numbers go through `Intl`, never
//                                 through hand-rolled string concatenation
//   • persistence + system sync — `skald.locale` / `skald.locale.follow`
//
// Two access paths exist on purpose:
//   `useT()`   — React components; re-renders when the locale changes.
//   `t()`      — non-React code (toast builders, log helpers, Rust-bridge
//                error presenters). Reads the module-level active locale, which
//                the provider keeps in sync.

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import en, { type Dict, type TranslationKey } from './en';
import zhCN from './zh-CN';

// ─── Locales ──────────────────────────────────────────────────────────────────

export const LOCALES = ['en', 'zh-CN'] as const;
export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = 'en';

/** Display metadata for the language picker. Names are always self-referential —
 *  a user hunting for their own language should never have to read it in a
 *  language they do not speak yet. */
export const LOCALE_META: Record<Locale, { label: string; native: string; region: string }> = {
  en: { label: 'English', native: 'English', region: 'United States' },
  'zh-CN': { label: 'Chinese (Simplified)', native: '简体中文', region: '中国' },
};

const DICTS: Record<Locale, Dict> = { en, 'zh-CN': zhCN };

// ─── Persistence ──────────────────────────────────────────────────────────────

const KEY_LOCALE = 'skald.locale';
const KEY_FOLLOW = 'skald.locale.followSystem';

function readStoredLocale(): { locale: Locale; followSystem: boolean } {
  try {
    const stored = localStorage.getItem(KEY_LOCALE);
    const followSystem = localStorage.getItem(KEY_FOLLOW) !== 'false';
    if (stored && (LOCALES as readonly string[]).includes(stored)) {
      return { locale: stored as Locale, followSystem };
    }
  } catch {
    /* localStorage unavailable (private mode / storage disabled) — fall through */
  }
  return { locale: detectSystemLocale(), followSystem: true };
}

/** Maps a BCP-47 tag onto the closest shipped locale. Anything Chinese resolves
 *  to Simplified; everything else falls back to English, which is the safer
 *  default than showing a user a language they may not read at all. */
export function normalizeLocale(tag: string | undefined | null): Locale {
  if (!tag) return DEFAULT_LOCALE;
  const lower = tag.toLowerCase();
  if (lower.startsWith('zh')) return 'zh-CN';
  if (lower.startsWith('en')) return 'en';
  return DEFAULT_LOCALE;
}

export function detectSystemLocale(): Locale {
  if (typeof navigator === 'undefined') return DEFAULT_LOCALE;
  const tags = [navigator.language, ...(navigator.languages ?? [])].filter(Boolean);
  for (const tag of tags) {
    const normalized = normalizeLocale(tag);
    // Only accept a tag we actually recognised; normalizeLocale's fallback would
    // otherwise make the *first* unknown tag decide the result.
    if (normalized !== DEFAULT_LOCALE || tag.toLowerCase().startsWith('en')) return normalized;
  }
  return DEFAULT_LOCALE;
}

/** True when the OS reports a language Skald does not ship a dictionary for. */
export function isSystemLocaleSupported(): boolean {
  if (typeof navigator === 'undefined') return true;
  const tag = navigator.language;
  if (!tag) return true;
  return tag.toLowerCase().startsWith('zh') || tag.toLowerCase().startsWith('en');
}

// ─── Interpolation & plurals ──────────────────────────────────────────────────

export type Vars = Record<string, string | number>;

function interpolate(template: string, vars?: Vars): string {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) => {
    const value = vars[name];
    return value === undefined ? match : String(value);
  });
}

/** Plural bucket selection. English needs one/other; Chinese (like Japanese and
 *  Korean) has a single CLDR category, so `_one` is reused for every count.
 *  Rather than pulling in Intl.PluralRules' full rule set we use the one rule
 *  that actually distinguishes our two locales. */
function pluralSuffix(locale: Locale, count: number): 'one' | 'other' {
  if (locale === 'en') return count === 1 ? 'one' : 'other';
  return 'other';
}

// ─── Active locale (module-level mirror) ──────────────────────────────────────

let activeLocale: Locale = DEFAULT_LOCALE;

/** Translate without a React context. Safe to call from modules that run before
 *  the provider mounts — they get the default locale until the provider syncs. */
export function t(key: TranslationKey, vars?: Vars): string {
  const dict = DICTS[activeLocale] ?? DICTS[DEFAULT_LOCALE];
  if (vars && typeof vars.count === 'number') {
    const suffixed = `${key}_${pluralSuffix(activeLocale, vars.count)}` as TranslationKey;
    const candidate = dict[suffixed] ?? DICTS[DEFAULT_LOCALE][suffixed];
    if (candidate) return interpolate(candidate, vars);
  }
  return interpolate(dict[key] ?? DICTS[DEFAULT_LOCALE][key] ?? key, vars);
}

/** Resolve a key in an explicit locale — used by the language preview card,
 *  which must render the *candidate* language before it is applied. */
export function translateIn(locale: Locale, key: TranslationKey, vars?: Vars): string {
  const dict = DICTS[locale] ?? DICTS[DEFAULT_LOCALE];
  if (vars && typeof vars.count === 'number') {
    const suffixed = `${key}_${pluralSuffix(locale, vars.count)}` as TranslationKey;
    const candidate = dict[suffixed] ?? DICTS[DEFAULT_LOCALE][suffixed];
    if (candidate) return interpolate(candidate, vars);
  }
  return interpolate(dict[key] ?? DICTS[DEFAULT_LOCALE][key] ?? key, vars);
}

export function getActiveLocale(): Locale {
  return activeLocale;
}

// ─── Date / number formatting ─────────────────────────────────────────────────

export type DateFormatPref = 'auto' | 'iso' | 'medium' | 'long';

const KEY_DATE_FORMAT = 'skald.dateFormat';
const KEY_TIME_24H = 'skald.timeFormat24h';

export function readDateFormatPref(): DateFormatPref {
  try {
    const stored = localStorage.getItem(KEY_DATE_FORMAT);
    if (stored === 'iso' || stored === 'medium' || stored === 'long' || stored === 'auto') return stored;
  } catch { /* ignore */ }
  return 'auto';
}

export function readTimeFormat24h(): boolean {
  try {
    const stored = localStorage.getItem(KEY_TIME_24H);
    if (stored !== null) return stored === 'true';
  } catch { /* ignore */ }
  return activeLocale === 'zh-CN';
}

function intlLocale(locale: Locale): string {
  return locale === 'zh-CN' ? 'zh-CN' : 'en-US';
}

export function formatDate(
  value: Date | number | string,
  options: { locale?: Locale; pref?: DateFormatPref; withTime?: boolean } = {},
): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const locale = options.locale ?? activeLocale;
  const pref = options.pref ?? readDateFormatPref();

  if (pref === 'iso') {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return options.withTime ? `${y}-${m}-${d} ${formatTime(date, { locale })}` : `${y}-${m}-${d}`;
  }

  const base: Intl.DateTimeFormatOptions =
    pref === 'long'
      ? { year: 'numeric', month: 'long', day: 'numeric' }
      : pref === 'medium'
        ? { year: 'numeric', month: 'short', day: 'numeric' }
        : { year: 'numeric', month: 'short', day: 'numeric' };

  // An explicit `pref` of auto still gets a language-appropriate shape: zh-CN
  // conventionally uses the 2026年11月3日 form, which `dateStyle: 'medium'`
  // already produces. Enumerating fields keeps it stable across engines.
  return new Intl.DateTimeFormat(intlLocale(locale), base).format(date);
}

export function formatTime(
  value: Date | number,
  options: { locale?: Locale; hour12?: boolean } = {},
): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const locale = options.locale ?? activeLocale;
  const hour12 = options.hour12 ?? !readTimeFormat24h();
  return new Intl.DateTimeFormat(intlLocale(locale), {
    hour: '2-digit',
    minute: '2-digit',
    hour12,
  }).format(date);
}

export function formatDateTime(
  value: Date | number,
  options: { locale?: Locale; pref?: DateFormatPref } = {},
): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return `${formatDate(date, options)} ${formatTime(date, { locale: options.locale })}`;
}

export function formatNumber(value: number, options: { locale?: Locale; maximumFractionDigits?: number } = {}): string {
  return new Intl.NumberFormat(intlLocale(options.locale ?? activeLocale), {
    maximumFractionDigits: options.maximumFractionDigits ?? 1,
  }).format(value);
}

/** "3 minutes ago" / "3 分钟前", via Intl.RelativeTimeFormat. Chooses the unit
 *  automatically so callers never hand-roll the thresholds. */
export function formatRelative(
  then: Date | number,
  options: { locale?: Locale; now?: number } = {},
): string {
  const date = then instanceof Date ? then : new Date(then);
  const locale = options.locale ?? activeLocale;
  const now = options.now ?? Date.now();
  const diffSec = Math.round((date.getTime() - now) / 1000);
  const abs = Math.abs(diffSec);
  const rtf = new Intl.RelativeTimeFormat(intlLocale(locale), { numeric: 'auto' });
  if (abs < 60) return rtf.format(diffSec, 'second');
  if (abs < 3600) return rtf.format(Math.round(diffSec / 60), 'minute');
  if (abs < 86_400) return rtf.format(Math.round(diffSec / 3600), 'hour');
  if (abs < 2_592_000) return rtf.format(Math.round(diffSec / 86_400), 'day');
  if (abs < 31_536_000) return rtf.format(Math.round(diffSec / 2_592_000), 'month');
  return rtf.format(Math.round(diffSec / 31_536_000), 'year');
}

// ─── React context ────────────────────────────────────────────────────────────

export interface I18nValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  followSystem: boolean;
  setFollowSystem: (follow: boolean) => void;
  /** Unbound translate for the current locale. */
  t: (key: TranslationKey, vars?: Vars) => string;
  formatDate: typeof formatDate;
  formatTime: typeof formatTime;
  formatDateTime: typeof formatDateTime;
  formatNumber: typeof formatNumber;
  formatRelative: typeof formatRelative;
}

const I18nContext = createContext<I18nValue | null>(null);

const SIDEBAR_KEY = 'skald.ui.sidebar';

function applyDocumentLocale(locale: Locale) {
  if (typeof document === 'undefined') return;
  document.documentElement.lang = locale;
  document.documentElement.dataset.locale = locale;
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const initial = useMemo(readStoredLocale, []);
  const [locale, setLocaleState] = useState<Locale>(initial.locale);
  const [followSystem, setFollowState] = useState<boolean>(initial.followSystem);

  // Keep the module-level mirror honest before any child effect runs, so
  // non-React `t()` calls during the same render pass already see the right
  // language.
  activeLocale = locale;

  useEffect(() => {
    applyDocumentLocale(locale);
  }, [locale]);

  // When "follow system" is on, track OS language changes live (Windows and
  // GNOME both fire `languagechange` after a locale switch).
  useEffect(() => {
    if (!followSystem) return;
    const handler = () => {
      const next = detectSystemLocale();
      setLocaleState(next);
      activeLocale = next;
    };
    window.addEventListener('languagechange', handler);
    return () => window.removeEventListener('languagechange', handler);
  }, [followSystem]);

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next);
    activeLocale = next;
    try {
      localStorage.setItem(KEY_LOCALE, next);
      // An explicit pick means the user is no longer deferring to the OS.
      localStorage.setItem(KEY_FOLLOW, 'false');
    } catch { /* ignore */ }
    setFollowState(false);
  }, []);

  const setFollowSystem = useCallback((follow: boolean) => {
    setFollowState(follow);
    try { localStorage.setItem(KEY_FOLLOW, String(follow)); } catch { /* ignore */ }
    if (follow) {
      const next = detectSystemLocale();
      setLocaleState(next);
      activeLocale = next;
      try { localStorage.setItem(KEY_LOCALE, next); } catch { /* ignore */ }
    }
  }, []);

  const value = useMemo<I18nValue>(() => ({
    locale,
    setLocale,
    followSystem,
    setFollowSystem,
    t: (key, vars) => translateIn(locale, key, vars),
    formatDate,
    formatTime,
    formatDateTime,
    formatNumber,
    formatRelative,
  }), [locale, setLocale, followSystem, setFollowSystem]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nValue {
  const ctx = useContext(I18nContext);
  if (!ctx) {
    // A missing provider should not blank the whole app — degrade to the default
    // locale so a stray component outside the tree still renders readable text.
    return {
      locale: DEFAULT_LOCALE,
      setLocale: () => {},
      followSystem: true,
      setFollowSystem: () => {},
      t: (key, vars) => translateIn(DEFAULT_LOCALE, key, vars),
      formatDate,
      formatTime,
      formatDateTime,
      formatNumber,
      formatRelative,
    };
  }
  return ctx;
}

/** Convenience hook for components that only need the translate function. */
export function useT() {
  return useI18n().t;
}

export { SIDEBAR_KEY };
export type { Dict, TranslationKey };
export { en, zhCN };
