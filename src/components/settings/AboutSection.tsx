import { useState, useEffect } from 'react';
import { useI18n } from '../../i18n';
import { getVersion } from '@tauri-apps/api/app';
import { openUrl } from '@tauri-apps/plugin-opener';
import lyreIcon from '../../assets/lyre.png';
import type { OnyxState } from '../../state/onyx';
import { useModalFocus } from '../../hooks/useModalFocus';
import { SectionHead, Row, SERIF, MONO } from './shared';
import { exportTextFile } from '../../api/abs';
import { log } from '../../lib/log';
import quickStart from '../../../docs/QUICK_START.md?raw';

const ghostBtn = {
  padding: 'var(--s-2) var(--s-4)', fontSize: 'var(--fs-1)', fontFamily: MONO, letterSpacing: '0.06em',
  textTransform: 'uppercase' as const, background: 'var(--onyx-glass)',
  border: '1px solid var(--onyx-glass-edge)', borderRadius: 'var(--r-sm)', color: 'var(--onyx-text-dim)', cursor: 'pointer',
} as const;

// Canonical SPDX license text for an identifier.
const spdx = (id: string) => `https://spdx.org/licenses/${id}.html`;

// Bundled third-party components grouped by license, each linking to the SPDX
// license text. Mirrored in the vault's "Open Source Licenses.md" backup — keep
// both in sync when deps change.
const LICENSE_GROUPS: { licenses: { id: string; url: string }[]; items: string[]; source?: { label: string; url: string } }[] = [
  {
    licenses: [{ id: 'LGPL-2.1-or-later', url: spdx('LGPL-2.1-or-later') }],
    items: ['LibVLC — VLC media player runtime (audio engine)'],
    source: { label: 'Source: videolan.org', url: 'https://www.videolan.org/vlc/download-sources.html' },
  },
  { licenses: [{ id: 'OFL-1.1 (SIL Open Font License)', url: spdx('OFL-1.1') }], items: ['Inter', 'JetBrains Mono', 'Source Serif 4'] },
  { licenses: [{ id: 'Apache-2.0', url: spdx('Apache-2.0') }, { id: 'MIT', url: spdx('MIT') }], items: ['Tauri & official plugins', '@tauri-apps/api', 'serde / serde_json', 'reqwest', 'keyring', 'directories', 'chrono', 'futures-util', 'base64', 'log'] },
  { licenses: [{ id: 'MIT', url: spdx('MIT') }], items: ['React, React DOM', '@tanstack/react-virtual', 'tokio / tokio-util', 'rust_socketio', 'vlc-rs (LibVLC bindings)', 'zip'] },
];

// Accent link that opens in the system browser via the opener plugin.
function Lnk({ url, children }: { url: string; children: React.ReactNode }) {
  return (
    <span
      onClick={() => { void openUrl(url).catch(() => {}); }}
      style={{ color: 'var(--onyx-accent)', cursor: 'pointer', textDecoration: 'underline', textUnderlineOffset: 2 }}
    >{children}</span>
  );
}

// The full third-party notices are large (~3 MB of verbatim license texts), so
// lazy-load them only when the user asks rather than bundling into the main chunk.
async function loadNotices(): Promise<string> {
  const mod = await import('../../assets/THIRD-PARTY-NOTICES.txt?raw');
  return mod.default;
}

function LicensesModal({ onClose }: { onClose: () => void }) {
  const { t } = useI18n();
  const [status, setStatus] = useState('');
  // Shared modal contract: Escape to close, Tab containment, focus restore. Without
  // it this modal had no Escape handler and no focus trap — a keyboard user could
  // Tab straight into the background settings shell.
  const dialogRef = useModalFocus<HTMLDivElement>(onClose);

  const copyFull = async () => {
    setStatus('Loading…');
    try {
      const text = await loadNotices();
      await navigator.clipboard.writeText(text);
      setStatus(`Copied full notices (${Math.round(text.length / 1024)} KB)`);
    } catch (e) { setStatus(`Failed: ${String(e)}`); }
  };

  const saveFull = async () => {
    setStatus('Loading…');
    try {
      const text = await loadNotices();
      // Dialog + write both run Rust-side (export_text_file) so no path string
      // ever originates in the renderer.
      const saved = await exportTextFile('THIRD-PARTY-NOTICES.txt', text);
      setStatus(saved ? 'Saved' : '');
    } catch (e) { setStatus(`Failed: ${String(e)}`); }
  };

  return (
    <div
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
      style={{ position: 'fixed', inset: 0, zIndex: 500, background: 'rgba(0,0,0,0.72)', backdropFilter: 'blur(10px)', WebkitBackdropFilter: 'blur(10px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 'var(--s-6)' }}
    >
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-label={t('about.licensesAria')} style={{ width: '100%', maxWidth: 520, maxHeight: '85vh', background: 'var(--surface-overlay)', border: '1px solid var(--onyx-glass-edge)', borderRadius: 'var(--r-overlay)', boxShadow: 'var(--shadow-dialog)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {/* Header */}
        <div style={{ flexShrink: 0, padding: 'var(--s-5) var(--s-5) 0 var(--s-6)', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 'var(--s-4)' }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontFamily: SERIF, fontSize: 19, fontWeight: 500, letterSpacing: '-0.015em' }}>{t('about.licensesAria')}</div>
            <div style={{ fontFamily: MONO, fontSize: 'var(--fs-0)', color: 'var(--onyx-text-mute)', letterSpacing: '0.06em', marginTop: 'var(--s-2)' }}>{t('about.componentsBundled')}</div>
          </div>
          <button onClick={onClose} style={{ width: 28, height: 28, borderRadius: 'var(--r-sm)', background: 'none', border: '1px solid transparent', color: 'var(--onyx-text-mute)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 'var(--fs-4)', lineHeight: 1, flexShrink: 0, marginTop: '2px' }}>✕</button>
        </div>
        <div style={{ flexShrink: 0, height: 1, background: 'var(--onyx-line)', margin: 'var(--s-4) 0 0' }} />

        {/* Groups */}
        <div style={{ flex: 1, overflowY: 'auto', padding: 'var(--s-4) var(--s-6) var(--s-2)' }}>
          {LICENSE_GROUPS.map((g, gi) => (
            <div key={gi} style={{ marginBottom: 'var(--s-5)' }}>
              <div style={{ fontFamily: MONO, fontSize: 'var(--fs-0)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 'var(--s-2)' }}>
                {g.licenses.map((l, i) => (
                  <span key={l.id}>
                    {i > 0 && <span style={{ color: 'var(--onyx-text-mute)' }}> OR </span>}
                    <Lnk url={l.url}>{l.id}</Lnk>
                  </span>
                ))}
              </div>
              {g.items.map(it => (
                <div key={it} style={{ fontSize: 'var(--fs-2)', color: 'var(--onyx-text-dim)', padding: 'var(--s-1) 0', lineHeight: 1.4 }}>{it}</div>
              ))}
              {g.source && (
                <div style={{ fontFamily: MONO, fontSize: 'var(--fs-0)', marginTop: 'var(--s-1)', letterSpacing: '0.03em' }}>
                  <Lnk url={g.source.url}>{g.source.label}</Lnk>
                </div>
              )}
            </div>
          ))}
          <div style={{ fontSize: 'var(--fs-2)', color: 'var(--onyx-text-mute)', lineHeight: 1.55, paddingTop: 'var(--s-1)', paddingBottom: 'var(--s-2)' }}>
            License names link to the canonical SPDX text. The complete third-party notices below bundle the verbatim license text and copyright for every shipped Rust crate, npm package, LibVLC, and the fonts.
          </div>
        </div>

        {/* Footer — the full bundled notices (verbatim texts), copy/save on demand */}
        <div style={{ flexShrink: 0, borderTop: '1px solid var(--onyx-line)', padding: 'var(--s-3) var(--s-6)', display: 'flex', alignItems: 'center', gap: 'var(--s-3)' }}>
          <span style={{ fontFamily: MONO, fontSize: 'var(--fs-0)', color: 'var(--onyx-text-mute)', letterSpacing: '0.06em', flex: 1 }}>
            {status || 'Full third-party notices'}
          </span>
          <button style={{ ...ghostBtn, padding: 'var(--s-2) var(--s-3)' }} onClick={() => void copyFull()}>{t('about.copyAll')}</button>
          <button style={{ ...ghostBtn, padding: 'var(--s-2) var(--s-3)' }} onClick={() => void saveFull()}>Save…</button>
        </div>
      </div>
    </div>
  );
}

function HelpModal({ onClose }: { onClose: () => void }) {
  const { t } = useI18n();
  // Shared modal contract (Escape, Tab containment, focus restore) — replaces the
  // ad-hoc Escape-only listener this modal had, which left no focus trap so a
  // keyboard user could Tab out into the settings shell behind it.
  const dialogRef = useModalFocus<HTMLElement>(onClose);
  return (
    <div onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }} style={{ position: 'fixed', inset: 0, zIndex: 500, padding: 'var(--s-6)', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.72)', backdropFilter: 'blur(10px)' }}>
      <section ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="quick-start-title" style={{ width: '100%', maxWidth: 700, maxHeight: '85vh', display: 'flex', flexDirection: 'column', overflow: 'hidden', borderRadius: 'var(--r-overlay)', border: '1px solid var(--onyx-glass-edge)', background: 'var(--surface-overlay)', boxShadow: 'var(--shadow-dialog)' }}>
        <div style={{ padding: 'var(--s-5) var(--s-6)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--onyx-line)' }}>
          <h2 id="quick-start-title" style={{ margin: '0', fontFamily: SERIF, fontSize: 'var(--fs-6)' }}>{t('about.quickStartHeading')}</h2>
          <button onClick={onClose} aria-label={t('about.closeQuickStart')} style={{ width: 30, height: 30, border: 0, background: 'transparent', color: 'var(--onyx-text-dim)', cursor: 'pointer', fontSize: 'var(--fs-5)' }}>×</button>
        </div>
        <pre className="onyx-selectable" style={{ margin: '0', padding: 'var(--s-5) var(--s-6) var(--s-8)', overflow: 'auto', whiteSpace: 'pre-wrap', fontFamily: 'inherit', fontSize: 'var(--fs-2)', lineHeight: 1.65, color: 'var(--onyx-text-dim)' }}>{quickStart}</pre>
      </section>
    </div>
  );
}

export default function AboutSection({ st }: { st: OnyxState }) {
  const { t } = useI18n();
  const [showLicenses, setShowLicenses] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  // Read the app version from Tauri (sourced from tauri.conf.json) so the About
  // header never goes stale on a version bump. Empty until resolved (~instant);
  // the label falls back to just "Onyx" for that first frame.
  const [version, setVersion] = useState('');
  useEffect(() => { getVersion().then(setVersion).catch(() => {}); }, []);

  // Re-run the full first-launch flow (Onboarding roadmap, Resolved decisions #4).
  // Clearing the flag re-opens <Onboarding> via the gate in App.tsx; existing
  // auth/local state is left intact, so the ABS step shows "already connected".
  const runSetupAgain = () => {
    log.info('app', 'onboarding rerun requested');
    st.setOnboarded(false);
  };

  return (
    <div>
      <SectionHead title={t('about.title')} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--s-5)', padding: '0 0 var(--s-6)', borderBottom: '1px solid var(--onyx-line)' }}>
        <img
          src={lyreIcon}
          alt="Skald"
          style={{ width: 64, height: 64, objectFit: 'contain', filter: 'drop-shadow(0 0 12px rgba(var(--onyx-accent-r), var(--onyx-accent-g), var(--onyx-accent-b), 0.3))' }}
        />
        <div>
          <div style={{ fontFamily: SERIF, fontSize: 'var(--fs-7)', fontWeight: 500 }}>Skald<span style={{ color: 'var(--onyx-accent)' }}>.</span></div>
          <div style={{ fontFamily: MONO, fontSize: 'var(--fs-1)', color: 'var(--onyx-text-mute)', marginTop: 'var(--s-1)' }}>{version ? `v${version} · Onyx` : 'Onyx'}</div>
          <div style={{ fontSize: 'var(--fs-2)', color: 'var(--onyx-text-dim)', marginTop: 'var(--s-2)', maxWidth: 480 }}>A native desktop client for Audiobookshelf.</div>
        </div>
      </div>

      <Row label={t('about.licensesAria')} hint={t('about.licensesHint')}>
        <button style={ghostBtn} onClick={() => setShowLicenses(true)}>{t('about.view')}</button>
      </Row>

      <Row label={t('about.quickStart')} hint={t('about.quickStartHint')}>
        <button style={ghostBtn} onClick={() => setShowHelp(true)}>{t('about.openGuide')}</button>
      </Row>

      <Row label={t('about.rerunSetup')} hint={t('about.rerunSetupHint')}>
        <button style={ghostBtn} onClick={runSetupAgain}>{t('about.runSetup')}</button>
      </Row>

      {showLicenses && <LicensesModal onClose={() => setShowLicenses(false)} />}
      {showHelp && <HelpModal onClose={() => setShowHelp(false)} />}
    </div>
  );
}
