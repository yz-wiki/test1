// i18n runtime contract tests.
//
// These guard the three failure modes that are invisible in development because
// the English fallback masks them: a locale missing keys, interpolation
// placeholders drifting between locales, and plural buckets resolving to the
// wrong string.
import { describe, expect, it } from 'vitest';
import en from './en';
import zhCN from './zh-CN';
import { normalizeLocale, detectSystemLocale, formatDate, formatNumber, translateIn, LOCALES } from './index';

describe('dictionary parity', () => {
  it('ships every English key in Chinese', () => {
    const englishKeys = Object.keys(en).sort();
    const chineseKeys = Object.keys(zhCN).sort();
    expect(chineseKeys).toEqual(englishKeys);
  });

  it('never leaves an empty translation', () => {
    for (const locale of LOCALES) {
      const dict = locale === 'en' ? en : zhCN;
      for (const [key, value] of Object.entries(dict)) {
        expect(value.trim(), `${locale}:${key}`).not.toBe('');
      }
    }
  });

  it('keeps the same interpolation placeholders in both locales', () => {
    const placeholders = (text: string) => (text.match(/\{(\w+)\}/g) ?? []).sort();
    for (const key of Object.keys(en) as Array<keyof typeof en>) {
      // Plural variants are allowed to differ in wording but not in variables.
      expect(placeholders(zhCN[key]), `placeholder mismatch for ${key}`).toEqual(placeholders(en[key]));
    }
  });
});

describe('locale normalisation', () => {
  it('maps any Chinese tag to zh-CN', () => {
    expect(normalizeLocale('zh')).toBe('zh-CN');
    expect(normalizeLocale('zh-Hans')).toBe('zh-CN');
    expect(normalizeLocale('zh-TW')).toBe('zh-CN');
    expect(normalizeLocale('ZH-cn')).toBe('zh-CN');
  });

  it('maps English tags to en', () => {
    expect(normalizeLocale('en')).toBe('en');
    expect(normalizeLocale('en-GB')).toBe('en');
  });

  it('falls back to English for anything unsupported', () => {
    expect(normalizeLocale('fr-FR')).toBe('en');
    expect(normalizeLocale(null)).toBe('en');
    expect(normalizeLocale('')).toBe('en');
  });

  it('detects a supported locale from the environment', () => {
    // jsdom reports en-US; the assertion is intentionally loose so the test does
    // not depend on the host machine's language.
    expect(LOCALES).toContain(detectSystemLocale());
  });
});

describe('translation', () => {
  it('interpolates named variables', () => {
    expect(translateIn('en', 'search.placeholder', { count: 42 })).toContain('42');
    expect(translateIn('zh-CN', 'search.placeholder', { count: 42 })).toContain('42');
  });

  it('selects the singular bucket for a count of one', () => {
    expect(translateIn('en', 'toast.syncFlushed', { count: 1 })).toMatch(/update to server$/);
    expect(translateIn('en', 'toast.syncFlushed', { count: 1 })).not.toContain('updates');
  });

  it('selects the plural bucket for any other count', () => {
    expect(translateIn('en', 'toast.syncFlushed', { count: 0 })).toContain('updates');
    expect(translateIn('en', 'toast.syncFlushed', { count: 7 })).toContain('updates');
  });

  it('uses the single Chinese plural form for every count', () => {
    // Compare the templates, not the rendered strings: the interpolated count
    // differs by definition, but the wording around it must not change.
    const strip = (text: string) => text.replace(/\d+/g, 'N');
    const one = translateIn('zh-CN', 'toast.syncFlushed', { count: 1 });
    const many = translateIn('zh-CN', 'toast.syncFlushed', { count: 9 });
    expect(strip(one)).toBe(strip(many));
  });

  it('leaves an unknown placeholder untouched rather than printing undefined', () => {
    expect(translateIn('en', 'search.placeholder', {})).toContain('{count}');
  });
});

describe('regional formatting', () => {
  const sample = new Date(2026, 10, 3, 15, 4, 0);

  it('formats ISO dates identically in both locales', () => {
    expect(formatDate(sample, { locale: 'en', pref: 'iso' })).toBe('2026-11-03');
    expect(formatDate(sample, { locale: 'zh-CN', pref: 'iso' })).toBe('2026-11-03');
  });

  it('formats medium dates with the locale convention', () => {
    expect(formatDate(sample, { locale: 'en', pref: 'medium' })).toContain('2026');
    expect(formatDate(sample, { locale: 'zh-CN', pref: 'medium' })).toContain('2026');
  });

  it('groups numbers per locale', () => {
    expect(formatNumber(1234.5, { locale: 'en' })).toBe('1,234.5');
    expect(formatNumber(1234.5, { locale: 'zh-CN' })).toBe('1,234.5');
  });
});
