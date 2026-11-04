import { useI18n } from '../../i18n';
// Step 1 — Welcome. Brands the app, states the one-line value prop, and offers a
// single "Begin" CTA into the path chooser. (First-Launch Onboarding, Phase 1.)
import { GoldButton, SERIF, MONO } from './frame';

export interface WelcomeStepProps { onBegin: () => void; }

export default function WelcomeStep({ onBegin }: WelcomeStepProps) {
  const { t } = useI18n();
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-8)' }}>
      <div style={{ fontSize: 'var(--fs-4)', lineHeight: 1.6, color: 'var(--onyx-text)', fontFamily: SERIF, maxWidth: 460 }}>
        Skald plays your audiobooks — streamed from an{' '}
        <span style={{ color: 'var(--onyx-accent)', fontStyle: 'italic' }}>Audiobookshelf</span> server,
        kept as <span style={{ color: 'var(--onyx-accent)', fontStyle: 'italic' }}>{t('onbWelcome.localLibraries')}</span> on this
        computer, or both at once. A few short steps and the hall is yours.
      </div>

      {/* Three at-a-glance capabilities — quiet mono labels, no chrome. */}
      <div style={{ display: 'flex', gap: 'var(--s-6)', flexWrap: 'wrap' }}>
        {['Stream & sync', 'Listen offline', 'No server needed'].map(t => (
          <div key={t} style={{ display: 'flex', alignItems: 'center', gap: 'var(--s-2)' }}>
            <div style={{ width: 5, height: 5, borderRadius: 'var(--r-xs)', background: 'var(--onyx-accent)' }} />
            <span style={{ fontFamily: MONO, fontSize: 'var(--fs-0)', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--onyx-text-dim)' }}>{t}</span>
          </div>
        ))}
      </div>

      <div>
        <GoldButton onClick={onBegin}>{t('onbWelcome.begin')}</GoldButton>
      </div>
    </div>
  );
}
