// Step 1 — Welcome. Brands the app, states the one-line value prop, and offers a
// single "Begin" CTA into the path chooser. (First-Launch Onboarding, Phase 1.)
import { GoldButton, SERIF, MONO } from './frame';

export interface WelcomeStepProps { onBegin: () => void; }

export default function WelcomeStep({ onBegin }: WelcomeStepProps) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
      <div style={{ fontSize: 15, lineHeight: 1.6, color: 'rgba(235,231,223,0.8)', fontFamily: SERIF, maxWidth: 460 }}>
        Skald 播放你的有声书——从{' '}
        <span style={{ color: 'var(--onyx-accent)', fontStyle: 'italic' }}>Audiobookshelf</span> 服务器串流，
        或保存在这台电脑上的{' '}
        <span style={{ color: 'var(--onyx-accent)', fontStyle: 'italic' }}>本机书库</span> 中，
        也可以两者并用。短短几步之后，殿堂便归你所有。
      </div>

      {/* Three at-a-glance capabilities — quiet mono labels, no chrome. */}
      <div style={{ display: 'flex', gap: 26, flexWrap: 'wrap' }}>
        {['串流与同步', '离线收听', '无需服务器'].map(t => (
          <div key={t} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ width: 5, height: 5, borderRadius: 3, background: 'var(--onyx-accent)' }} />
            <span style={{ fontFamily: MONO, fontSize: 10.5, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(235,231,223,0.55)' }}>{t}</span>
          </div>
        ))}
      </div>

      <div>
        <GoldButton onClick={onBegin}>开始</GoldButton>
      </div>
    </div>
  );
}
