// Step 5 — How to add books. Teaches the two import routes once, at the moment it
// matters: the shared Add books dialog exposes files, folders, and the watched
// Staging folder from the same entry point used by the main shell and Settings.
// (First-Launch Onboarding, Phase 3.)
import { useState } from 'react';
import { useI18n } from '../../i18n';
import type { OnyxState } from '../../state/onyx';
import type { Library } from '../../api/abs';
import { GoldButton, SERIF, MONO, SANS } from './frame';
import LocalImportDialog from '../LocalImportDialog';

export interface AddBooksStepProps {
  st: OnyxState;
  // The library created in step 4 (null if the user skipped it). Determines
  // whether the inline "Add books now" action is available.
  library: Library | null;
  onContinue: () => void;
}

// A self-contained CSS scene: a file glyph drops into Staging, then travels to the
// filed Author/Series/Title shelf — looping. All motion is in index.css keyframes
// (onb-file / onb-pulse), gated by prefers-reduced-motion.
function StagingScene() {
  const { t } = useI18n();
  const box: React.CSSProperties = {
    position: 'absolute', top: '30%', width: 96, height: 62, borderRadius: 'var(--r-card)',
    border: '1px solid rgba(var(--onyx-accent-r),var(--onyx-accent-g),var(--onyx-accent-b),0.3)',
    background: 'rgba(var(--onyx-accent-r),var(--onyx-accent-g),var(--onyx-accent-b),0.05)',
    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 'var(--s-1)',
  };
  const cap: React.CSSProperties = { fontFamily: MONO, fontSize: 'var(--fs-0)', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--onyx-text-dim)' };
  return (
    <div className="onb-scene" style={{ position: 'relative', height: 130, marginTop: 'var(--s-2)', marginBottom: 'var(--s-1)' }}>
      {/* Dotted travel line */}
      <div style={{ position: 'absolute', top: '50%', left: '20%', right: '20%', height: 0, borderTop: '1px dashed var(--onyx-text-mute)' }} />
      {/* Staging box (left) */}
      <div style={{ ...box, left: '8%' }}>
        <span style={{ fontSize: 'var(--fs-6)', lineHeight: 1 }}>📁</span>
        <span style={cap}>{t('onbBooks.staging')}</span>
      </div>
      {/* Filed box (right) */}
      <div className="onb-filed" style={{ ...box, right: '8%' }}>
        <span style={{ fontSize: 'var(--fs-6)', lineHeight: 1 }}>🗂️</span>
        <span style={cap}>{t('onbBooks.authorSeries')}</span>
      </div>
      {/* Travelling file glyph */}
      <div className="onb-file" style={{ position: 'absolute', width: 24, height: 28, borderRadius: 'var(--r-xs)', background: 'linear-gradient(180deg,#e9bb5e,#a37d2e)', boxShadow: 'var(--shadow-popover)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#1a1306', fontFamily: MONO, fontSize: 'var(--fs-0)', fontWeight: 700 }}>
        ♪
      </div>
    </div>
  );
}

function RouteCard({ badge, title, children }: { badge: string; title: string; children: React.ReactNode }) {
  return (
    <div style={{ flex: 1, minWidth: 200, padding: 'var(--s-4) var(--s-4)', borderRadius: 'var(--r-card)', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.08)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--s-2)', marginBottom: 'var(--s-2)' }}>
        <span style={{ fontFamily: MONO, fontSize: 'var(--fs-0)', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--onyx-accent)', border: '1px solid rgba(var(--onyx-accent-r),var(--onyx-accent-g),var(--onyx-accent-b),0.3)', borderRadius: 'var(--r-xs)', padding: 'var(--s-1) var(--s-2)' }}>{badge}</span>
        <span style={{ fontFamily: SERIF, fontSize: 'var(--fs-4)', fontWeight: 600, color: 'var(--onyx-text)' }}>{title}</span>
      </div>
      <div style={{ fontSize: 'var(--fs-2)', color: 'var(--onyx-text)', lineHeight: 1.5 }}>{children}</div>
    </div>
  );
}

export default function AddBooksStep({ st, library, onContinue }: AddBooksStepProps) {
  const { t } = useI18n();
  const [importOpen, setImportOpen] = useState(false);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-5)' }}>
      <StagingScene />

      <div style={{ display: 'flex', gap: 'var(--s-3)', flexWrap: 'wrap' }}>
        <RouteCard badge="Automatic" title={t('onbBooks.dropToStaging')}>
          Copy audiobooks — files <em>or whole book folders</em> — into the library's{' '}
          <span style={{ color: 'var(--onyx-text)' }}>{t('onbBooks.staging')}</span> folder. Skald reads each book's tags and
          chapters and files it under Author / Series / Title automatically.
        </RouteCard>
        <RouteCard badge="Manual" title={t('onbBooks.addBooksButton')}>
          {t('onbBooks.manualLead')} <span style={{ color: 'var(--onyx-text)' }}>{t('onbBooks.addBooks')}</span>{' '}
          {t('onbBooks.manualTail')}
        </RouteCard>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--s-5)', marginTop: 'var(--s-1)' }}>
        <GoldButton onClick={onContinue}>{t('onbBooks.continue')}</GoldButton>
        {library ? (
          <button
            type="button"
            onClick={() => setImportOpen(true)}
            style={{
              padding: 'var(--s-3) var(--s-5)', borderRadius: 999, fontFamily: MONO, fontSize: 'var(--fs-0)', letterSpacing: '0.08em', textTransform: 'uppercase',
              background: 'transparent', border: '1px solid rgba(var(--onyx-accent-r),var(--onyx-accent-g),var(--onyx-accent-b),0.4)',
              color: 'var(--onyx-accent)', cursor: 'pointer',
            }}
          >
            Add books
          </button>
        ) : (
          <span style={{ fontFamily: SANS, fontSize: 'var(--fs-2)', color: 'var(--onyx-text-dim)' }}>
            {t('onbBooks.createLibraryFirst')}
          </span>
        )}
      </div>
      {importOpen && library && (
        <LocalImportDialog st={st} library={library} onClose={() => setImportOpen(false)} />
      )}
    </div>
  );
}
