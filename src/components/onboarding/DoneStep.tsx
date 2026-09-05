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
  // Build the summary from what actually happened, not just the chosen path, so a
  // skipped sub-step doesn't claim something that wasn't done.
  const lines: { label: string; value: string }[] = [];
  if (st.authToken) lines.push({ label: '服务器', value: st.serverUrl });
  if (created)      lines.push({ label: '本机书库', value: created.name });
  if (lines.length === 0) {
    lines.push({ label: '模式', value: '本机——随时可在“设置”中添加书库' });
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {lines.map(l => (
          <div key={l.label} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', borderRadius: 10, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.08)' }}>
            <span style={{ color: 'var(--onyx-accent)', fontSize: 15 }}>✓</span>
            <span style={{ fontFamily: MONO, fontSize: 9.5, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(235,231,223,0.45)', width: 110, flexShrink: 0 }}>{l.label}</span>
            <span style={{ fontFamily: SERIF, fontSize: 14.5, color: '#ebe7df', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.value}</span>
          </div>
        ))}
      </div>

      <div style={{ fontFamily: SERIF, fontStyle: 'italic', fontSize: 14, color: 'rgba(235,231,223,0.6)', maxWidth: 440, lineHeight: 1.55 }}>
        {path === 'abs'
          ? '你的收藏已就绪。步入其中，接着上次讲到的故事继续听吧。'
          : '殿堂已备好。推门而入，就此开始。'}
      </div>

      <div><GoldButton onClick={onFinish}>进入书库</GoldButton></div>
    </div>
  );
}
