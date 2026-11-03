// Settings → Language & Region.
//
// The pane follows the macOS "grouped list" settings pattern: a rounded card per
// concern, one control per row, the current value right-aligned. Language
// changes apply instantly (the provider re-renders), and the preview block below
// the picker shows the *candidate* locale's own copy so the user can confirm the
// choice without committing blind.
import { useI18n, LOCALES, LOCALE_META, translateIn, detectSystemLocale, isSystemLocaleSupported, type DateFormatPref } from '../../i18n';
import Icon from '../Icon';
import { useState, type CSSProperties } from 'react';

const DATE_FORMATS: { value: DateFormatPref; labelKey: 'language.dateFormat.auto' | 'language.dateFormat.iso' | 'language.dateFormat.medium' | 'language.dateFormat.long' }[] = [
  { value: 'auto', labelKey: 'language.dateFormat.auto' },
  { value: 'iso', labelKey: 'language.dateFormat.iso' },
  { value: 'medium', labelKey: 'language.dateFormat.medium' },
  { value: 'long', labelKey: 'language.dateFormat.long' },
];

const cardStyle: CSSProperties = {
  background: 'var(--mac-control-bg)',
  border: '1px solid var(--mac-hairline)',
  borderRadius: 'var(--mac-radius-card)',
  overflow: 'hidden',
};

const rowStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 16,
  padding: '13px 16px',
  borderTop: '1px solid var(--mac-hairline)',
};

export default function LanguageSection() {
  const { t, locale, setLocale, followSystem, setFollowSystem, formatDate } = useI18n();

  // These two prefs are not part of OnyxState — they only affect formatting, so
  // they live in localStorage next to the locale itself (see i18n/index.tsx).
  const [datePref, setDatePref] = useState<DateFormatPref>(() => {
    try {
      const stored = localStorage.getItem('skald.dateFormat');
      if (stored === 'iso' || stored === 'medium' || stored === 'long' || stored === 'auto') return stored;
    } catch { /* ignore */ }
    return 'auto';
  });
  const [hour24, setHour24] = useState<boolean>(() => {
    try {
      const stored = localStorage.getItem('skald.timeFormat24h');
      if (stored !== null) return stored === 'true';
    } catch { /* ignore */ }
    return locale === 'zh-CN';
  });

  const persistDatePref = (value: DateFormatPref) => {
    setDatePref(value);
    try { localStorage.setItem('skald.dateFormat', value); } catch { /* ignore */ }
  };

  const persistHour24 = (value: boolean) => {
    setHour24(value);
    try { localStorage.setItem('skald.timeFormat24h', String(value)); } catch { /* ignore */ }
  };

  const systemLocale = detectSystemLocale();
  const sample = formatDate(new Date(), { locale, pref: datePref === 'auto' ? 'medium' : datePref, withTime: false });

  return (
    <div style={{ maxWidth: 720 }}>
      <header style={{ marginBottom: 22 }}>
        <h2 style={{ margin: 0, fontSize: 17, fontWeight: 650, letterSpacing: '-0.01em' }}>
          {t('language.title')}
        </h2>
        <p style={{ margin: '6px 0 0', fontSize: 12.5, color: 'var(--onyx-text-dim)', lineHeight: 1.55 }}>
          {t('language.description')}
        </p>
      </header>

      {/* ── Application language ─────────────────────────────────────────── */}
      <section style={{ marginBottom: 22 }}>
        <div style={{ ...cardStyle }}>
          {LOCALES.map((candidate, index) => {
            const meta = LOCALE_META[candidate];
            const selected = candidate === locale;
            return (
              <button
                key={candidate}
                type="button"
                onClick={() => setLocale(candidate)}
                aria-pressed={selected}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 14,
                  width: '100%',
                  padding: '13px 16px',
                  border: 'none',
                  borderTop: index === 0 ? 'none' : '1px solid var(--mac-hairline)',
                  background: selected ? 'var(--onyx-accent-dim)' : 'transparent',
                  color: 'inherit',
                  fontFamily: 'inherit',
                  textAlign: 'left',
                  cursor: 'default',
                }}
              >
                <span style={{ display: 'inline-flex', color: selected ? 'var(--onyx-accent)' : 'var(--onyx-text-mute)' }}>
                  <Icon name="info" size={15} />
                </span>
                <span style={{ flex: '1 1 auto', minWidth: 0 }}>
                  <span style={{ display: 'block', fontSize: 13, fontWeight: 600 }}>
                    {meta.native}
                  </span>
                  <span style={{ display: 'block', fontSize: 11.5, color: 'var(--onyx-text-mute)' }}>
                    {meta.label} · {meta.region}
                  </span>
                </span>
                {selected && <Icon name="check" size={14} color="var(--onyx-accent)" />}
              </button>
            );
          })}
        </div>
      </section>

      {/* ── System language ──────────────────────────────────────────────── */}
      <section style={{ marginBottom: 22 }}>
        <div style={cardStyle}>
          <div style={{ ...rowStyle, borderTop: 'none' }}>
            <div style={{ flex: '1 1 auto', minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 600 }}>{t('language.followSystem')}</div>
              <div style={{ fontSize: 11.5, color: 'var(--onyx-text-mute)', marginTop: 2 }}>
                {t('language.followSystemHint')}
              </div>
              <div style={{ fontSize: 11, color: 'var(--onyx-text-mute)', marginTop: 4 }}>
                {t('language.detected', { locale: LOCALE_META[systemLocale].native })}
                {!isSystemLocaleSupported() && (
                  <span className="mac-badge mac-badge--muted" style={{ marginLeft: 8 }}>
                    fallback
                  </span>
                )}
              </div>
            </div>
            <button
              type="button"
              className="mac-switch"
              role="switch"
              aria-checked={followSystem}
              aria-label={t('language.followSystem')}
              onClick={() => setFollowSystem(!followSystem)}
            />
          </div>
        </div>
      </section>

      {/* ── Region formatting ────────────────────────────────────────────── */}
      <section style={{ marginBottom: 22 }}>
        <div style={cardStyle}>
          <div style={{ ...rowStyle, borderTop: 'none' }}>
            <div style={{ flex: '1 1 auto' }}>
              <div style={{ fontSize: 13, fontWeight: 600 }}>{t('language.dateFormat')}</div>
            </div>
            <select
              className="onyx-select"
              value={datePref}
              onChange={(event) => persistDatePref(event.target.value as DateFormatPref)}
              aria-label={t('language.dateFormat')}
              style={{ minWidth: 220 }}
            >
              {DATE_FORMATS.map(option => (
                <option key={option.value} value={option.value}>{t(option.labelKey)}</option>
              ))}
            </select>
          </div>

          <div style={rowStyle}>
            <div style={{ flex: '1 1 auto' }}>
              <div style={{ fontSize: 13, fontWeight: 600 }}>{t('language.timeFormat24h')}</div>
              <div style={{ fontSize: 11.5, color: 'var(--onyx-text-mute)', marginTop: 2 }}>
                {t('language.timeFormat24hHint')}
              </div>
            </div>
            <button
              type="button"
              className="mac-switch"
              role="switch"
              aria-checked={hour24}
              aria-label={t('language.timeFormat24h')}
              onClick={() => persistHour24(!hour24)}
            />
          </div>
        </div>
      </section>

      {/* ── Preview ──────────────────────────────────────────────────────── */}
      <section>
        <div style={{ ...cardStyle, padding: '14px 18px' }}>
          <div style={{ fontFamily: 'var(--mac-font-mono)', fontSize: 9.5, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--onyx-text-mute)', marginBottom: 8 }}>
            {t('language.preview')}
          </div>
          <div style={{ fontFamily: 'var(--mac-font-serif)', fontSize: 17, letterSpacing: '-0.01em' }}>
            {sample}
          </div>
          <div style={{ fontSize: 12, color: 'var(--onyx-text-dim)', marginTop: 6 }}>
            {translateIn(locale, 'language.previewSample')}
          </div>
          <div style={{ fontSize: 11, color: 'var(--onyx-text-mute)', marginTop: 10 }}>
            {t('language.restartHint')}
          </div>
        </div>
      </section>
    </div>
  );
}
