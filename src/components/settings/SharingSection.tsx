import { useEffect, useState, useCallback } from 'react';
import type { CSSProperties } from 'react';
import type { OnyxState } from '../../state/onyx';
import { getFeeds, deleteShare, closeFeed, getShareBySlug, type RssFeed } from '../../api/abs';
import { getTrackedShares, removeTrackedShare, getPublicBaseUrl, setPublicBaseUrl, publicBase, absoluteFeedUrl, type TrackedShare } from '../../lib/shareTracker';
import { SectionHead, MONO, Panel } from './shared';
import { log } from '../../lib/log';

export interface SharingSectionProps { st: OnyxState; }

function publicShareUrl(serverUrl: string, slug: string): string {
  return `${publicBase(serverUrl)}/share/${slug}`;
}

async function copy(text: string, st: OnyxState, label: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
    st.setToast({ message: `已复制${label}到剪贴板`, type: 'success' });
  } catch {
    st.setToast({ message: `复制失败——${text}`, type: 'info' });
  }
}

/** The URL rendered as an accent link that copies to the clipboard on click. */
function CopyLink({ url, label, st }: { url: string; label: string; st: OnyxState }) {
  const [hover, setHover] = useState(false);
  return (
    <span
      onClick={() => void copy(url, st, label)}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      title="点击复制"
      style={{ color: 'var(--onyx-accent)', cursor: 'pointer', textDecoration: hover ? 'underline' : 'none' }}
    >
      {url}
    </span>
  );
}

/**
 * Sharing & RSS admin hub (cluster G). Three blocks:
 *  - Share Manager — lists locally-tracked shares (ABS has no list route), each
 *    re-validated against GET /api/share/:slug so stale entries self-purge;
 *  - RSS Feed Manager — lists open feeds from GET /api/feeds with a close action;
 *  - OPDS — informational only (ABS exposes no OPDS route).
 * Per-item creation lives in the shelf's Share & Publish modal.
 */
export default function SharingSection({ st }: SharingSectionProps) {
  const [shares, setShares] = useState<TrackedShare[]>([]);
  const [feeds, setFeeds] = useState<RssFeed[]>([]);
  const [feedsLoading, setFeedsLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  // Public base URL used to build share/feed links (persisted via shareTracker).
  const [pubUrl, setPubUrl] = useState(getPublicBaseUrl());

  // List locally-tracked shares, then re-validate each against the public share
  // route. Only a CONFIRMED 404 (the share is genuinely gone) purges a record —
  // any other failure (network blip, unexpected response shape) keeps it listed,
  // so a single bad response can never wipe valid local shares.
  const loadShares = useCallback(async () => {
    const tracked = getTrackedShares();
    setShares(tracked); // show immediately; validation only ever removes, never adds
    const checks = await Promise.allSettled(tracked.map(s => getShareBySlug(st.serverUrl, s.slug)));
    let purged = false;
    tracked.forEach((s, i) => {
      const c = checks[i];
      if (c.status === 'rejected' && /\b404\b/.test(String(c.reason))) {
        removeTrackedShare(s.id);
        purged = true;
      }
    });
    if (purged) setShares(getTrackedShares());
  }, [st.serverUrl]);

  const loadFeeds = useCallback(async () => {
    setFeedsLoading(true);
    try {
      setFeeds(await getFeeds(st.serverUrl));
    } catch (e) {
      log.error('sharing', 'getFeeds failed', { err: String(e) });
      st.setToast({ message: `加载订阅源失败：${String(e)}`, type: 'error' });
    } finally {
      setFeedsLoading(false);
    }
  }, [st.serverUrl]);

  useEffect(() => { void loadShares(); void loadFeeds(); }, [loadShares, loadFeeds]);

  const revokeShare = useCallback((s: TrackedShare) => {
    st.setConfirmDialog({
      title: '撤销分享链接？',
      message: `“${s.title}”的公开链接将立即失效。`,
      confirmLabel: '撤销',
      onConfirm: async () => {
        setBusyId(s.id);
        try {
          await deleteShare(st.serverUrl, s.id);
          removeTrackedShare(s.id);
          setShares(prev => prev.filter(x => x.id !== s.id));
          st.setToast({ message: '分享链接已撤销。', type: 'success' });
        } catch (e) {
          st.setToast({ message: `撤销失败：${String(e)}`, type: 'error' });
        } finally {
          setBusyId(null);
        }
      },
    });
  }, [st]);

  const close = useCallback((f: RssFeed) => {
    const name = f.meta?.title || f.slug || f.id;
    st.setConfirmDialog({
      title: '关闭 RSS 订阅源？',
      message: `公开订阅源“${name}”将立即失效。`,
      confirmLabel: '关闭订阅源',
      onConfirm: async () => {
        setBusyId(f.id);
        try {
          await closeFeed(st.serverUrl, f.id);
          setFeeds(prev => prev.filter(x => x.id !== f.id));
          st.setToast({ message: 'RSS 订阅源已关闭。', type: 'success' });
        } catch (e) {
          st.setToast({ message: `关闭失败：${String(e)}`, type: 'error' });
        } finally {
          setBusyId(null);
        }
      },
    });
  }, [st]);

  const sub: CSSProperties = { fontFamily: MONO, fontSize: 10.5, color: 'var(--onyx-text-mute)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: 3 };
  const ghostBtn: CSSProperties = { padding: '6px 12px', borderRadius: 7, cursor: 'pointer', background: 'var(--onyx-accent-dim)', border: '1px solid var(--onyx-accent-edge)', color: 'var(--onyx-accent)', fontFamily: MONO, fontSize: 10.5, flexShrink: 0 };
  const dangerBtn: CSSProperties = { padding: '6px 12px', borderRadius: 7, cursor: 'pointer', background: 'rgba(220,80,80,0.12)', border: '1px solid rgba(220,80,80,0.35)', color: '#e08a8a', fontFamily: MONO, fontSize: 10.5, flexShrink: 0 };
  const empty: CSSProperties = { fontFamily: MONO, fontSize: 11, color: 'var(--onyx-text-mute)', padding: '14px 2px', lineHeight: 1.5 };
  const input: CSSProperties = { padding: '8px 12px', minWidth: 320, fontSize: 13, background: 'rgba(0,0,0,0.3)', borderRadius: 8, color: 'var(--onyx-text)', border: '1px solid var(--onyx-glass-edge)', outline: 'none', fontFamily: MONO };
  // Flat row inside a panel; divider below unless it's the last entry.
  const row = (last: boolean): CSSProperties => ({ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 2px', borderBottom: last ? 'none' : '1px solid var(--onyx-line)' });

  return (
    <div>
      <SectionHead
        title="分享与 RSS"
        subtitle="管理公开分享链接与 RSS 订阅源。可在书库右键菜单的“分享与发布”中按条目创建。这些是仅限管理员使用的服务器功能。"
      />

      {/* ── Public link address ── */}
      <Panel label="公开链接地址">
        <div style={{ padding: '12px 2px 2px' }}>
          <input
            value={pubUrl}
            onChange={e => { setPubUrl(e.target.value); setPublicBaseUrl(e.target.value); }}
            placeholder={st.serverUrl}
            style={input}
          />
          <div style={{ ...empty, padding: '10px 0 2px' }}>
            分享链接与新 RSS 订阅源链接均以此地址为基础生成。留空则使用 Skald 所连接服务器的地址（{st.serverUrl}）。可将其设置为公网域名（例如 https://abs.example.com），以便在局域网外也能访问——你的 Audiobookshelf 服务器须在该地址可被访问。
          </div>
        </div>
      </Panel>

      {/* ── Share Manager ── */}
      <Panel label="分享链接">
        {shares.length === 0 ? (
          <div style={empty}>
            此设备上尚未创建过分享链接。ABS 不提供列出分享链接的接口，因此在 Web 客户端或其他设备上创建的链接不会显示在这里。
          </div>
        ) : shares.map((s, i) => (
          <div key={s.id} style={row(i === shares.length - 1)}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, color: 'var(--onyx-text)' }}>{s.title}</div>
              <div style={sub}>
                <CopyLink url={publicShareUrl(st.serverUrl, s.slug)} label="分享链接" st={st} />
                {s.expiresAt ? ` · 有效期至 ${new Date(s.expiresAt).toLocaleDateString()}` : ' · 永不过期'}
                {s.isDownloadable ? ' · 可下载' : ''}
              </div>
            </div>
            <button onClick={() => void copy(publicShareUrl(st.serverUrl, s.slug), st, '分享链接')} style={ghostBtn}>复制</button>
            <button onClick={() => revokeShare(s)} disabled={busyId === s.id} style={dangerBtn}>撤销</button>
          </div>
        ))}
      </Panel>

      {/* ── RSS Feed Manager ── */}
      <Panel label="已开启的 RSS 订阅源">
        {feedsLoading ? (
          <div style={empty}>加载中…</div>
        ) : feeds.length === 0 ? (
          <div style={empty}>暂无已开启的订阅源。可从条目的“分享与发布”菜单开启一个。</div>
        ) : feeds.map((f, i) => (
          <div key={f.id} style={row(i === feeds.length - 1)}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, color: 'var(--onyx-text)' }}>{f.meta?.title || f.slug}</div>
              <div style={sub}>{f.entityType} · <CopyLink url={absoluteFeedUrl(f.serverAddress, f.feedUrl, st.serverUrl)} label="订阅源地址" st={st} /></div>
            </div>
            <button onClick={() => void copy(absoluteFeedUrl(f.serverAddress, f.feedUrl, st.serverUrl), st, '订阅源地址')} style={ghostBtn}>复制</button>
            <button onClick={() => close(f)} disabled={busyId === f.id} style={dangerBtn}>关闭</button>
          </div>
        ))}
      </Panel>
    </div>
  );
}
