import { useI18n } from '../../i18n';
// Step 6 — All set. Summarises what was configured and offers the entry CTA into
// the library. The actual gate-close (setOnboarded / setLocalMode / setScreen) is
// performed by the host's finish handler. (First-Launch Onboarding, Phase 1.)
import type { OnyxState } from '../../state/onyx';
import type { Library } from '../../api/abs';
import type { OnboardingPath } from './ChoosePathStep';
import { GoldButton, SERIF, MONO } from './frame';

export interface DoneStepProps {
  st: OnyxState;
  path: OnboardingPath | null;
  created: Library | null;
  onFinish: () => void;
}

export default function DoneStep({ st, path, created, onFinish }: DoneStepProps) {
  const { t } = useI18n();
  // Build the summary from what actually happened, not just the chosen path, so a
  // skipped sub-step doesn't claim something that wasn't done.
  const lines: { label: string; value: string }[] = [];
  if (st.authToken) lines.push({ label: 'Server', value: st.serverUrl });
  if (created)      lines.push({ label: 'Local library', value: created.name });
  if (lines.length === 0) {
    lines.push({ label: 'Mode', value: 'Local — add a library any time in Settings' });
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-6)' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-2)' }}>
        {lines.map(l => (
          <div key={l.label} style={{ display: 'flex', alignItems: 'center', gap: 'var(--s-3)', padding: 'var(--s-3) var(--s-4)', borderRadius: 'var(--r-card)', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.08)' }}>
            <span style={{ color: 'var(--onyx-accent)', fontSize: 'var(--fs-4)' }}>✓</span>
            <span style={{ fontFamily: MONO, fontSize: 'var(--fs-0)', letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--onyx-text-dim)', width: 110, flexShrink: 0 }}>{l.label}</span>
            <span style={{ fontFamily: SERIF, fontSize: 'var(--fs-4)', color: 'var(--onyx-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.value}</span>
          </div>
        ))}
      </div>

      <div style={{ fontFamily: SERIF, fontStyle: 'italic', fontSize: 'var(--fs-4)', color: 'var(--onyx-text)', maxWidth: 440, lineHeight: 1.55 }}>
        {path === 'abs'
          ? 'Your collection is ready. Press in and pick up where the telling left off.'
          : 'The hall is ready. Open it and begin.'}
      </div>

      <div><GoldButton onClick={onFinish}>{t('onbDone.enterLibrary')}</GoldButton></div>
    </div>
  );
}
