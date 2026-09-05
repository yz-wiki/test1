// Metadata-provider panels: custom provider registration + the Open Library
// integration (community ratings + review-cache reset).
// Moved verbatim out of LibrariesSection.tsx (God-File Decomposition roadmap, L3/L7).
import { useState } from 'react';
import { Row, Toggle, MONO, Panel } from '../shared';
import type { OnyxState } from '../../../state/onyx';
import { clearReviewCache } from '../../../api/reviewCache';
import type { CustomMetadataProvider } from '../../../api/abs';
import { SmallBtn, Field } from './widgets';

export function CustomProvidersManager({ providers, onAdd, onDelete }: {
  providers: CustomMetadataProvider[];
  onAdd: (p: { name: string; url: string; mediaType: string; authHeaderValue?: string }) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}) {
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [auth, setAuth] = useState('');
  const [mediaType, setMediaType] = useState<'book' | 'podcast'>('book');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  async function add() {
    if (!name.trim() || !url.trim()) { setErr('需要填写名称和 URL。'); return; }
    setErr(''); setBusy(true);
    try {
      await onAdd({ name: name.trim(), url: url.trim(), mediaType, authHeaderValue: auth.trim() || undefined });
      setName(''); setUrl(''); setAuth('');
    } catch (e) {
      setErr(typeof e === 'string' ? e : (e as Error)?.message ?? '添加提供方失败。');
    } finally { setBusy(false); }
  }

  return (
    <Panel label="自定义元数据提供方">
      <div style={{ fontSize: 12, color: 'var(--onyx-text-dim)', margin: '10px 2px', lineHeight: 1.5 }}>
        注册一个社区或自托管提供方；注册后它将出现在上面的“提供方”下拉框和匹配对话框中。
      </div>

      {providers.length === 0 && (
        <div style={{ fontFamily: MONO, fontSize: 11, color: 'var(--onyx-text-mute)', padding: '4px 0 10px' }}>尚未注册任何提供方。</div>
      )}
      {providers.map(p => (
        <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderBottom: '1px solid var(--onyx-line)' }}>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 500 }}>{p.name}</div>
            <div style={{ fontFamily: MONO, fontSize: 10.5, color: 'var(--onyx-text-mute)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {p.mediaType === 'book' ? '有声书' : '播客'} · {p.url}
            </div>
          </div>
          <SmallBtn danger onClick={() => void onDelete(p.id)}>删除</SmallBtn>
        </div>
      ))}

      {/* Add form */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 14 }}>
        <div style={{ display: 'flex', gap: 8 }}>
          <Field value={name} onChange={setName} placeholder="提供方名称" />
          <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
            {(['book', 'podcast'] as const).map(mt => (
              <button key={mt} onClick={() => setMediaType(mt)} style={{
                padding: '5px 12px', borderRadius: 6,
                background: mediaType === mt ? 'var(--onyx-accent-dim)' : 'transparent',
                border: `1px solid ${mediaType === mt ? 'var(--onyx-accent-edge)' : 'rgba(255,255,255,0.08)'}`,
                color: mediaType === mt ? 'var(--onyx-accent)' : 'var(--onyx-text-mute)',
                fontFamily: MONO, fontSize: 10.5, cursor: 'pointer',
              }}>{mt === 'book' ? '有声书' : '播客'}</button>
            ))}
          </div>
        </div>
        <Field value={url} onChange={setUrl} placeholder="https://provider.example/search" mono />
        <Field value={auth} onChange={setAuth} placeholder="授权请求头值（可选）" mono />
        {err && <div style={{ fontFamily: MONO, fontSize: 11, color: '#e8716a' }}>{err}</div>}
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <SmallBtn onClick={add} disabled={busy}>{busy ? '添加中…' : '+ 添加提供方'}</SmallBtn>
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
  const [cacheCleared, setCacheCleared] = useState(false);
  return (
    <Panel label="Open Library">
      <div style={{ fontSize: 12, color: 'var(--onyx-text-dim)', margin: '10px 2px 2px', lineHeight: 1.5 }}>
        用 Open Library 的社区评分与书架数据丰富播放器内容。
      </div>

      <Row label="Open Library" hint="社区评分与书架数据。">
        <Toggle on={st.enableOpenLibrary} onChange={st.setEnableOpenLibrary} />
      </Row>

      <Row label="评分缓存" hint="下次进入播放器界面时强制重新获取全部评分数据。">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {cacheCleared && (
            <span style={{ fontFamily: MONO, fontSize: 10, color: 'var(--onyx-text-mute)', letterSpacing: '0.06em' }}>
              缓存已清空
            </span>
          )}
          <button
            onClick={() => {
              clearReviewCache();
              setCacheCleared(true);
              setTimeout(() => setCacheCleared(false), 2000);
            }}
            style={{
              padding: '7px 14px', borderRadius: 6, cursor: 'pointer',
              background: 'transparent', border: '1px solid var(--onyx-glass-edge)',
              color: 'var(--onyx-text-dim)', fontFamily: MONO, fontSize: 10,
              letterSpacing: '0.06em', textTransform: 'uppercase' as const,
            }}
          >
            清空评分缓存
          </button>
        </div>
      </Row>
    </Panel>
  );
}
