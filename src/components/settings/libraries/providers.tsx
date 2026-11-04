// Metadata-provider panels: custom provider registration + the Open Library
// integration (community ratings + review-cache reset).
// Moved verbatim out of LibrariesSection.tsx (God-File Decomposition roadmap, L3/L7).
import { useState } from 'react';
import { useI18n } from '../../../i18n';
import { Row, Toggle, MONO, Panel } from '../shared';
import type { OnyxState } from '../../../state/onyx';
import { clearReviewCache } from '../../../api/reviewCache';
import type { CustomMetadataProvider } from '../../../api/abs';
import { SmallBtn, Field } from './widgets';

export function CustomProvidersManager({ providers, onAdd, onDelete }: {
  providers: CustomMetadataProvider[];
  onAdd: (p: { name: string; url: string; mediaType: string; authHeaderValue?: string }) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}) {  const { t } = useI18n();

  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [auth, setAuth] = useState('');
  const [mediaType, setMediaType] = useState<'book' | 'podcast'>('book');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  async function add() {
    if (!name.trim() || !url.trim()) { setErr('Name and URL are required.'); return; }
    setErr(''); setBusy(true);
    try {
      await onAdd({ name: name.trim(), url: url.trim(), mediaType, authHeaderValue: auth.trim() || undefined });
      setName(''); setUrl(''); setAuth('');
    } catch (e) {
      setErr(typeof e === 'string' ? e : (e as Error)?.message ?? 'Failed to add provider.');
    } finally { setBusy(false); }
  }

  return (
    <Panel label={t('prov.customProviders')}>
      <div style={{ fontSize: 'var(--fs-2)', color: 'var(--onyx-text-dim)', margin: 'var(--s-3) var(--s-1)', lineHeight: 1.5 }}>
        Register a community or self-hosted provider; it then appears in the Provider dropdown above and in the Match dialog.
      </div>

      {providers.length === 0 && (
        <div style={{ fontFamily: MONO, fontSize: 'var(--fs-1)', color: 'var(--onyx-text-mute)', padding: 'var(--s-1) 0 var(--s-3)' }}>{t('prov.noneRegistered')}</div>
      )}
      {providers.map(p => (
        <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 'var(--s-3)', padding: 'var(--s-3) 0', borderBottom: '1px solid var(--onyx-line)' }}>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontSize: 'var(--fs-3)', fontWeight: 500 }}>{p.name}</div>
            <div style={{ fontFamily: MONO, fontSize: 'var(--fs-0)', color: 'var(--onyx-text-mute)', marginTop: 'var(--s-1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {p.mediaType} · {p.url}
            </div>
          </div>
          <SmallBtn danger onClick={() => void onDelete(p.id)}>{t('prov.delete')}</SmallBtn>
        </div>
      ))}

      {/* Add form */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-2)', marginTop: 'var(--s-4)' }}>
        <div style={{ display: 'flex', gap: 'var(--s-2)' }}>
          <Field value={name} onChange={setName} placeholder={t('prov.providerName')} />
          <div style={{ display: 'flex', gap: 'var(--s-1)', flexShrink: 0 }}>
            {(['book', 'podcast'] as const).map(mt => (
              <button key={mt} onClick={() => setMediaType(mt)} style={{
                padding: 'var(--s-1) var(--s-3)', borderRadius: 'var(--r-sm)',
                background: mediaType === mt ? 'var(--onyx-accent-dim)' : 'transparent',
                border: `1px solid ${mediaType === mt ? 'var(--onyx-accent-edge)' : 'rgba(255,255,255,0.08)'}`,
                color: mediaType === mt ? 'var(--onyx-accent)' : 'var(--onyx-text-mute)',
                fontFamily: MONO, fontSize: 'var(--fs-0)', cursor: 'pointer',
              }}>{mt}</button>
            ))}
          </div>
        </div>
        <Field value={url} onChange={setUrl} placeholder={t('prov.providerUrl')} mono />
        <Field value={auth} onChange={setAuth} placeholder={t('prov.providerAuth')} mono />
        {err && <div style={{ fontFamily: MONO, fontSize: 'var(--fs-1)', color: '#e8716a' }}>{err}</div>}
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <SmallBtn onClick={add} disabled={busy}>{busy ? 'Adding…' : '+ Add Provider'}</SmallBtn>
        </div>
      </div>
    </Panel>
  );
}

// ── Open Library integration ──────────────────────────────────────────────────
// Moved here from the former standalone Integrations tab — it enriches the player
// with Open Library community ratings, so it lives alongside library settings. The
// review-cache reset is part of the same integration (it clears Open Library data).
export function OpenLibraryManager({ st }: { st: OnyxState }) {
  const { t } = useI18n();
  const [cacheCleared, setCacheCleared] = useState(false);
  return (
    <Panel label="Open Library">
      <div style={{ fontSize: 'var(--fs-2)', color: 'var(--onyx-text-dim)', margin: 'var(--s-3) var(--s-1) var(--s-1)', lineHeight: 1.5 }}>
        {t('prov.openLibraryBody')}
      </div>

      <Row label="Open Library" hint={t('prov.openLibraryHint')}>
        <Toggle on={st.enableOpenLibrary} onChange={st.setEnableOpenLibrary} />
      </Row>

      <Row label={t('prov.reviewCache')} hint={t('prov.reviewCacheHint')}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--s-3)' }}>
          {cacheCleared && (
            <span style={{ fontFamily: MONO, fontSize: 'var(--fs-0)', color: 'var(--onyx-text-mute)', letterSpacing: '0.06em' }}>
              {t('prov.cacheCleared')}
            </span>
          )}
          <button
            onClick={() => {
              clearReviewCache();
              setCacheCleared(true);
              setTimeout(() => setCacheCleared(false), 2000);
            }}
            style={{
              padding: 'var(--s-2) var(--s-4)', borderRadius: 'var(--r-sm)', cursor: 'pointer',
              background: 'transparent', border: '1px solid var(--onyx-glass-edge)',
              color: 'var(--onyx-text-dim)', fontFamily: MONO, fontSize: 'var(--fs-0)',
              letterSpacing: '0.06em', textTransform: 'uppercase' as const,
            }}
          >
            {t('prov.clearCache')}
          </button>
        </div>
      </Row>
    </Panel>
  );
}
