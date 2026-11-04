// Shared chrome for the first-launch onboarding flow (First-Launch Onboarding
// roadmap, Phase 1). Mirrors the Saga login look — a left "manuscript" panel and
// a right content column — so the flow reads as the same product as Login.tsx.
// The right column is split into a scrolling content region (header + step body)
// and a fixed footer that the host fills with Back / progress dots / Skip.
import type { ReactNode } from 'react';
import Titlebar from '../chrome/Titlebar';
import lyreIcon from '../../assets/lyre.png';
import { useI18n } from '../../i18n';

// One family for interface text; monospace is opt-in via .ui-tech.
const UI_STACK = 'var(--font-ui)';

// Typography constants — identical tokens to Login.tsx so the two screens match.
export const SERIF = UI_STACK;
export const MONO  = 'var(--font-ui)';
export const SANS  = 'var(--font-ui)';

// Shared gold-pill CTA — the same gradient/shape as Login's "Enter" button.
// Reused by every step's primary action so the flow has one consistent CTA.
export function GoldButton({
  children, onClick, type = 'button', disabled = false, busy = false,
}: {
  children: ReactNode;
  onClick?: () => void;
  type?: 'button' | 'submit';
  disabled?: boolean;
  busy?: boolean;
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled || busy}
      className="saga-cta"
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 'var(--s-3)',
        background: 'linear-gradient(180deg, #e9bb5e, #d4a64a 55%, #a37d2e)',
        border: '1px solid rgba(var(--onyx-accent-r),var(--onyx-accent-g),var(--onyx-accent-b),0.35)',
        borderRadius: 999,
        color: '#1a1306', fontFamily: SERIF, fontWeight: 600, fontSize: 'var(--fs-4)',
        padding: 'var(--s-3) var(--s-8)', letterSpacing: '0.01em',
        cursor: disabled ? 'not-allowed' : busy ? 'wait' : 'pointer',
        opacity: disabled ? 0.55 : 1,
        boxShadow: 'var(--shadow-popover)',
        transition: 'transform 0.12s, box-shadow 0.18s, filter 0.12s',
      }}
    >
      {children}
      <span className="saga-arrow" style={{ display: 'flex', transition: 'transform 0.2s' }}>→</span>
    </button>
  );
}

// Quiet secondary text button (e.g. "Skip for now" inside a step body).
export function GhostButton({ children, onClick }: { children: ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        background: 'transparent', border: 'none', cursor: 'pointer',
        fontFamily: SERIF, fontStyle: 'italic', fontSize: 'var(--fs-3)',
        color: 'var(--onyx-text-dim)', padding: 'var(--s-2) var(--s-1)', textDecoration: 'underline',
        textUnderlineOffset: 3, textDecorationColor: 'var(--onyx-line)',
      }}
    >
      {children}
    </button>
  );
}

export interface StepFrameProps {
  // Mono eyebrow above the title (e.g. "STEP 2 OF 5").
  eyebrow: string;
  title: ReactNode;
  subtitle?: ReactNode;
  // The step body — fields, cards, explainer, etc.
  children: ReactNode;
  // The footer chrome (Back / dots / Skip) rendered by the host.
  footer: ReactNode;
  // Changing this remounts the animated content region so the slide-in replays.
  stepKey: string;
}

export default function StepFrame({ eyebrow, title, subtitle, children, footer, stepKey }: StepFrameProps) {
  const { t } = useI18n();
  return (
    <div style={{
      position: 'fixed', inset: 0, display: 'flex', overflow: 'hidden',
      background: 'var(--surface-canvas)', color: 'var(--onyx-text)', fontFamily: SANS,
    }}>
      {/* Window chrome — spans the full width and provides the drag region + the
          minimize/close controls (the window has no native decorations). Without
          this the onboarding window can't be moved or closed. Mirrors Login.tsx. */}
      <Titlebar isDark minimal />

      {/* Brand rail. Same surface, hairline and type scale as the sidebar it
          will hand over to once setup finishes — onboarding should feel like the
          first screen of the app, not a separate poster. */}
      <div
        style={{
          position: 'relative',
          width: 264,
          flexShrink: 0,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          gap: 'var(--s-6)',
          padding: 'var(--s-10) var(--s-6) var(--s-6)',
          borderRight: '1px solid var(--hairline)',
          background: 'var(--surface-raised)',
        }}
      >
        <div>
          <div className="ui-rowline" style={{ gap: 'var(--s-2)' }}>
            <img src={lyreIcon} alt="" aria-hidden="true" style={{ width: 20, height: 20, objectFit: 'contain' }} />
            <span style={{ fontSize: 'var(--fs-4)', fontWeight: 650, letterSpacing: '-0.01em' }}>Skald</span>
          </div>
          <h2 className="ui-h2" style={{ marginTop: 'var(--s-5)', fontSize: 'var(--fs-6)' }}>
            {t('frame.lead')} {t('frame.mid')}{' '}
            <span style={{ color: 'var(--onyx-accent)' }}>{t('frame.accent')}</span>{t('frame.tail')}
          </h2>
        </div>

        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <img
            src={lyreIcon}
            alt=""
            aria-hidden="true"
            style={{ width: 132, height: 132, objectFit: 'contain', opacity: 0.35 }}
          />
        </div>

        <div>
          <p className="ui-sub" style={{ margin: 0, fontStyle: 'italic' }}>{t('frame.quote')}</p>
          <div className="ui-group-label" style={{ marginTop: 'var(--s-3)' }}>{t('frame.attribution')}</div>
        </div>
      </div>

      {/* ── RIGHT PANEL — content column ───────────────────────────────────── */}
      <div style={{ position: 'relative', flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, zIndex: 10 }}>
        {/* Scrolling content region — header + step body, re-animated per step. */}
        <div
          key={stepKey}
          className="saga-in"
          style={{ flex: 1, overflowY: 'auto', padding: 'var(--s-10) var(--s-8) var(--s-6)', display: 'flex', flexDirection: 'column', justifyContent: 'center', minHeight: 0 }}
        >
          <div style={{ width: '100%', maxWidth: 560, margin: '0 auto' }}>
            <div style={{ marginBottom: 'var(--s-6)' }}>
              <div style={{ fontFamily: MONO, fontSize: 'var(--fs-0)', letterSpacing: '0.24em', textTransform: 'uppercase', color: 'var(--onyx-accent)', marginBottom: 'var(--s-3)' }}>
                {eyebrow}
              </div>
              <div style={{ fontFamily: SERIF, fontSize: 28, fontWeight: 600, letterSpacing: '-0.01em', color: 'var(--onyx-text)', lineHeight: 1.15 }}>
                {title}
              </div>
              {subtitle && (
                <div style={{ fontSize: 'var(--fs-4)', fontFamily: SANS, color: 'var(--onyx-text-dim)', marginTop: 'var(--s-3)', lineHeight: 1.5, maxWidth: 480 }}>
                  {subtitle}
                </div>
              )}
            </div>
            {children}
          </div>
        </div>

        {/* Fixed footer chrome — host fills with Back / dots / Skip. */}
        <div style={{
          flexShrink: 0, padding: 'var(--s-4) 44px', borderTop: '1px solid rgba(255,255,255,0.06)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--s-4)',
        }}>
          {footer}
        </div>
      </div>
    </div>
  );
}

// Row of progress dots showing position within the active branch. The current
// step is a wider gold bar; completed/upcoming are small muted dots.
export function ProgressDots({ count, index }: { count: number; index: number }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--s-2)' }}>
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          style={{
            height: 4, borderRadius: 'var(--r-xs)',
            width: i === index ? 20 : 4,
            background: i === index
              ? 'var(--onyx-accent)'
              : i < index ? 'rgba(var(--onyx-accent-r),var(--onyx-accent-g),var(--onyx-accent-b),0.4)' : 'rgba(255,255,255,0.16)',
            transition: 'width 0.25s, background 0.25s',
          }}
        />
      ))}
    </div>
  );
}
