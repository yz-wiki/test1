import { useState, useEffect, useCallback } from 'react';
import type { OnyxState } from '../../state/onyx';
import {
  getNotifications,
  updateNotificationSettings,
  createNotification,
  updateNotification,
  deleteNotification,
  testNotification,
  fireTestNotificationEvent,
  fetchLibraries,
  NOTIFICATION_TYPES,
  type Notification,
  type NotificationSettings,
  type NotificationEventData,
  type Library,
} from '../../api/abs';
import { SectionHead, Row, MONO, SERIF, Panel } from './shared';

export interface NotificationsSectionProps { st: OnyxState; }

// External Apprise API setup docs — surfaced next to the appriseApiUrl field.
const APPRISE_DOCS_URL = 'https://github.com/advplyr/audiobookshelf/blob/master/server/objects/settings/NotificationSettings.js';
const APPRISE_API_URL = 'https://github.com/caronc/apprise-api';

// ── Small styled helpers (match the Onyx settings idiom) ────────────────────────

function Btn({
  children, onClick, variant = 'ghost', disabled,
}: {
  children: React.ReactNode;
  onClick: () => void;
  variant?: 'ghost' | 'accent' | 'danger';
  disabled?: boolean;
}) {
  const palette = {
    ghost:  { bg: 'transparent',            border: 'var(--onyx-glass-edge)', color: 'var(--onyx-text-dim)' },
    accent: { bg: 'var(--onyx-accent-dim)', border: 'var(--onyx-accent-edge)', color: 'var(--onyx-accent)' },
    danger: { bg: 'rgba(220,80,80,0.12)',   border: 'rgba(220,80,80,0.35)',    color: '#e08a8a' },
  }[variant];
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        fontFamily: MONO, fontSize: 11, padding: '5px 12px', borderRadius: 6,
        background: palette.bg, border: `1px solid ${palette.border}`,
        color: palette.color, cursor: disabled ? 'default' : 'pointer',
        opacity: disabled ? 0.45 : 1,
      }}
    >
      {children}
    </button>
  );
}

function Field({
  value, onChange, placeholder, mono,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  mono?: boolean;
}) {
  return (
    <input
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      style={{
        fontFamily: mono ? MONO : 'inherit', fontSize: 12,
        background: 'var(--onyx-panel2)', color: 'var(--onyx-text)',
        border: '1px solid var(--onyx-glass-edge)', borderRadius: 6,
        padding: '6px 10px', width: '100%', outline: 'none',
      }}
    />
  );
}

// Tag-style editor for Apprise target URLs (same interaction as the sort-prefix
// editor in ServerSettingsSection — click a chip to remove, Enter to add).
// The pending input is owned by the parent so a typed-but-not-yet-added URL can
// be flushed when the user clicks Create without pressing Enter first.
function UrlEditor({
  urls, onChange, input, setInput,
}: {
  urls: string[];
  onChange: (u: string[]) => void;
  input: string;
  setInput: (v: string) => void;
}) {
  function add() {
    const v = input.trim();
    if (v && !urls.includes(v)) onChange([...urls, v]);
    setInput('');
  }
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap' as const, gap: 6, alignItems: 'center' }}>
      {urls.map(u => (
        <button
          key={u}
          onClick={() => onChange(urls.filter(x => x !== u))}
          title="点击移除"
          style={{
            fontFamily: MONO, fontSize: 11, background: 'var(--onyx-accent-dim)',
            border: '1px solid var(--onyx-accent-edge)', borderRadius: 6,
            padding: '4px 10px', color: 'var(--onyx-accent)', cursor: 'pointer',
            maxWidth: 320, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}
        >
          {u} ✕
        </button>
      ))}
      <input
        value={input}
        onChange={e => setInput(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); add(); } }}
        onBlur={add}
        placeholder="ntfy://topic  （按 Enter 添加）"
        style={{
          fontFamily: MONO, fontSize: 11, background: 'var(--onyx-panel2)',
          color: 'var(--onyx-text)', border: '1px solid var(--onyx-glass-edge)',
          borderRadius: 6, padding: '4px 10px', minWidth: 180, flex: 1,
        }}
      />
    </div>
  );
}

// ── Rule editor (create / edit one notification) ────────────────────────────────

interface EditorProps {
  initial: Notification | null;     // null = creating a new rule
  events: NotificationEventData[];
  libraries: Library[];
  onCancel: () => void;
  onSave: (payload: Partial<Notification>, id?: string) => void;
}

function RuleEditor({ initial, events, libraries, onCancel, onSave }: EditorProps) {
  // Seed local form state from the rule being edited, or sensible defaults.
  const [eventName, setEventName] = useState(initial?.eventName || events[0]?.name || 'onTest');
  const [libraryId, setLibraryId] = useState(initial?.libraryId || '');
  const [urls, setUrls] = useState<string[]>(initial?.urls || []);
  // Pending text in the URL input that hasn't been committed to `urls` yet.
  // Owned here (not in UrlEditor) so save() can flush it if the user clicks
  // Create without pressing Enter, and so the disabled check can see it.
  const [urlInput, setUrlInput] = useState('');
  const [titleTemplate, setTitleTemplate] = useState(initial?.titleTemplate || '');
  const [bodyTemplate, setBodyTemplate] = useState(initial?.bodyTemplate || '');
  const [type, setType] = useState(initial?.type || 'info');
  const [enabled, setEnabled] = useState(initial?.enabled ?? true);

  const event = events.find(e => e.name === eventName);
  const requiresLibrary = event?.requiresLibrary ?? false;

  // When switching to an event with no prior templates, pre-fill from the
  // event's defaults so the user starts from a working template.
  useEffect(() => {
    if (!initial && event?.defaults) {
      setTitleTemplate(prev => prev || event.defaults!.title);
      setBodyTemplate(prev => prev || event.defaults!.body);
    }
  }, [eventName]); // eslint-disable-line react-hooks/exhaustive-deps

  // Flush any uncommitted text in the URL input into the list, so a user who
  // typed a URL but didn't press Enter still gets it included.
  function effectiveUrls(): string[] {
    const pending = urlInput.trim();
    return pending && !urls.includes(pending) ? [...urls, pending] : urls;
  }

  function save() {
    const payload: Partial<Notification> = {
      eventName,
      libraryId: requiresLibrary ? (libraryId || null) : null,
      urls: effectiveUrls(),
      titleTemplate,
      bodyTemplate,
      type,
      enabled,
    };
    onSave(payload, initial?.id ?? undefined);
  }

  const labelStyle = { fontFamily: MONO, fontSize: 10, letterSpacing: '0.08em', textTransform: 'uppercase' as const, color: 'var(--onyx-text-mute)', marginBottom: 6 };
  const selectStyle = {
    fontFamily: MONO, fontSize: 12, background: 'var(--onyx-panel2)', color: 'var(--onyx-text)',
    border: '1px solid var(--onyx-glass-edge)', borderRadius: 6, padding: '6px 10px', cursor: 'pointer',
  };

  return (
    <div style={{
      border: '1px solid var(--onyx-accent-edge)', borderRadius: 10,
      padding: 18, marginTop: 14, marginBottom: 8,
      background: 'var(--onyx-glass)', display: 'flex', flexDirection: 'column', gap: 16,
    }}>
      <div style={{ fontFamily: SERIF, fontSize: 16 }}>{initial ? '编辑通知' : '新建通知'}</div>

      {/* Event */}
      <div>
        <div style={labelStyle}>事件</div>
        <select value={eventName} onChange={e => setEventName(e.target.value)} style={{ ...selectStyle, width: '100%' }}>
          {events.map(ev => <option key={ev.name} value={ev.name}>{ev.name}</option>)}
        </select>
        {event?.description && (
          <div style={{ fontSize: 11.5, color: 'var(--onyx-text-mute)', marginTop: 6 }}>{event.description}</div>
        )}
      </div>

      {/* Library (only for events that require one) */}
      {requiresLibrary && (
        <div>
          <div style={labelStyle}>书库</div>
          <select value={libraryId} onChange={e => setLibraryId(e.target.value)} style={{ ...selectStyle, width: '100%' }}>
            <option value="">— 选择书库 —</option>
            {libraries.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
        </div>
      )}

      {/* Target URLs */}
      <div>
        <div style={labelStyle}>Apprise URL</div>
        <UrlEditor urls={urls} onChange={setUrls} input={urlInput} setInput={setUrlInput} />
        <div style={{ fontSize: 11, color: 'var(--onyx-text-mute)', marginTop: 6 }}>
          使用 Apprise URL 方案，例如 <code style={{ fontFamily: MONO }}>ntfy://topic</code>、{' '}
          <code style={{ fontFamily: MONO }}>discord://id/token</code>、{' '}
          <code style={{ fontFamily: MONO }}>tgram://bottoken/chatid</code>。
        </div>
      </div>

      {/* Templates */}
      <div>
        <div style={labelStyle}>标题模板</div>
        <Field value={titleTemplate} onChange={setTitleTemplate} placeholder="例如：新单集 {{podcastTitle}}！" mono />
      </div>
      <div>
        <div style={labelStyle}>正文模板</div>
        <Field value={bodyTemplate} onChange={setBodyTemplate} placeholder="例如：{{episodeTitle}} 已添加。" mono />
      </div>

      {/* Available variables for the chosen event */}
      {event && event.variables.length > 0 && (
        <div style={{ fontSize: 11, color: 'var(--onyx-text-mute)', lineHeight: 1.6 }}>
          可用变量：{' '}
          {event.variables.map(v => (
            <code key={v} style={{ fontFamily: MONO, color: 'var(--onyx-text-dim)', marginRight: 8 }}>{`{{${v}}}`}</code>
          ))}
        </div>
      )}

      {/* Type + enabled */}
      <div style={{ display: 'flex', gap: 24, alignItems: 'center' }}>
        <div>
          <div style={labelStyle}>类型</div>
          <select value={type} onChange={e => setType(e.target.value)} style={selectStyle}>
            {NOTIFICATION_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, cursor: 'pointer', marginTop: 18 }}>
          <input type="checkbox" checked={enabled} onChange={e => setEnabled(e.target.checked)} />
          已启用
        </label>
      </div>

      {/* Actions — Create is gated on having at least one URL (committed OR
          typed-but-not-yet-added) and, for library events, a chosen library. */}
      <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
        <Btn variant="ghost" onClick={onCancel}>取消</Btn>
        <Btn
          variant="accent"
          onClick={save}
          disabled={(urls.length === 0 && !urlInput.trim()) || (requiresLibrary && !libraryId)}
        >
          {initial ? '保存更改' : '创建'}
        </Btn>
      </div>
    </div>
  );
}

// ── Main section ────────────────────────────────────────────────────────────────

export default function NotificationsSection({ st }: NotificationsSectionProps) {
  // Hook-free admin guard wrapper — see BackupSection for the rationale
  // (an early return between hooks crashes React if isAdmin flips).
  if (!st.isAdmin) return null;
  return <NotificationsSectionInner st={st} />;
}

function NotificationsSectionInner({ st }: NotificationsSectionProps) {
  const [settings, setSettings] = useState<NotificationSettings | null>(null);
  const [events, setEvents] = useState<NotificationEventData[]>([]);
  const [libraries, setLibraries] = useState<Library[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Local draft of the Apprise URL field (committed on blur, not every keystroke).
  const [appriseDraft, setAppriseDraft] = useState('');
  // editing = the rule being edited; 'new' = the create form; null = neither.
  const [editing, setEditing] = useState<Notification | 'new' | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const resp = await getNotifications(st.serverUrl);
      setSettings(resp.settings);
      setEvents(resp.data?.events ?? []);
      setAppriseDraft(resp.settings.appriseApiUrl ?? '');
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, [st.serverUrl]);

  useEffect(() => { void load(); }, [load]);

  // Libraries are only needed for the rule editor's library picker; fetch once.
  useEffect(() => {
    fetchLibraries(st.serverUrl).then(setLibraries).catch(() => { /* picker stays empty */ });
  }, [st.serverUrl]);

  // ── Mutations (each toasts; setSettings keeps the UI in sync) ────────────────

  async function patchSettings(partial: Partial<NotificationSettings>) {
    try {
      const updated = await updateNotificationSettings(st.serverUrl, partial);
      setSettings(updated);
      st.setToast({ message: '通知设置已保存。', type: 'success' });
    } catch (e) {
      st.setToast({ message: `保存失败：${e}`, type: 'error' });
    }
  }

  async function saveRule(payload: Partial<Notification>, id?: string) {
    try {
      const updated = id
        ? await updateNotification(st.serverUrl, id, payload)
        : await createNotification(st.serverUrl, payload);
      setSettings(updated);
      setEditing(null);
      st.setToast({ message: id ? '通知已更新。' : '通知已创建。', type: 'success' });
    } catch (e) {
      st.setToast({ message: `保存通知失败：${e}`, type: 'error' });
    }
  }

  async function removeRule(id: string) {
    try {
      const updated = await deleteNotification(st.serverUrl, id);
      setSettings(updated);
      st.setToast({ message: '通知已删除。', type: 'success' });
    } catch (e) {
      st.setToast({ message: `删除失败：${e}`, type: 'error' });
    }
  }

  async function testRule(id: string) {
    st.setToast({ message: '正在发送测试通知…', type: 'info' });
    try {
      await testNotification(st.serverUrl, id);
      st.setToast({ message: '测试通知已发送。', type: 'success' });
    } catch (e) {
      st.setToast({ message: `测试失败：${e}`, type: 'error' });
    }
  }

  async function fireTest() {
    st.setToast({ message: '正在触发测试事件…', type: 'info' });
    try {
      await fireTestNotificationEvent(st.serverUrl);
      st.setToast({ message: '测试事件已触发。', type: 'success' });
    } catch (e) {
      st.setToast({ message: `测试事件失败：${e}`, type: 'error' });
    }
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div>
        <SectionHead title="通知" subtitle="通过 Apprise 发送的事件驱动通知。仅管理员可用。" />
        <div style={{ fontFamily: MONO, fontSize: 11, color: 'var(--onyx-text-mute)', marginTop: 24 }}>
          正在加载通知设置…
        </div>
      </div>
    );
  }

  if (error || !settings) {
    return (
      <div>
        <SectionHead title="通知" subtitle="通过 Apprise 发送的事件驱动通知。仅管理员可用。" />
        <div style={{
          fontFamily: MONO, fontSize: 11, color: 'var(--onyx-text-mute)', marginTop: 24,
          padding: '12px 16px', background: 'var(--onyx-glass)', borderRadius: 8,
          border: '1px solid var(--onyx-glass-edge)',
        }}>
          无法加载通知设置{error ? `：${error}` : ''}。
          <div style={{ marginTop: 10 }}><Btn variant="accent" onClick={() => void load()}>重试</Btn></div>
        </div>
      </div>
    );
  }

  const rules = settings.notifications ?? [];
  const hasApprise = !!settings.appriseApiUrl;

  return (
    <div>
      <SectionHead
        title="通知"
        subtitle="通过 Apprise API 服务器发送事件驱动通知（播客下载、备份、RSS 失败等）。仅管理员可用。"
      />

      {/* ── Apprise connection ───────────────────────────────────────────── */}
      <Panel label="Apprise 连接">

      {/* Persistent explanatory note — the #1 source of confusion is that ABS
          does not bundle Apprise and needs an external Apprise API server. */}
      <div style={{
        fontSize: 12, color: 'var(--onyx-text-dim)', lineHeight: 1.55,
        background: 'var(--onyx-glass)', border: '1px solid var(--onyx-glass-edge)',
        borderRadius: 8, padding: '12px 14px', margin: '12px 0',
      }}>
        Audiobookshelf 本身不包含 Apprise——它会将通知转发给你自行托管（通常通过 Docker）的独立
        <strong>Apprise API 服务器</strong>。请在下方设置其 <code style={{ fontFamily: MONO }}>/notify</code> 端点 URL。
        如果 Apprise API 服务器不可达，将不会送达任何通知。{' '}
        <a href={APPRISE_API_URL} target="_blank" rel="noreferrer" style={{ color: 'var(--onyx-accent)' }}>
          Apprise API 设置
        </a>
        {' · '}
        <a href={APPRISE_DOCS_URL} target="_blank" rel="noreferrer" style={{ color: 'var(--onyx-accent)' }}>
          ABS 通知文档
        </a>
      </div>

      <Row label="Apprise API URL" hint="你的 Apprise API 服务器 notify 端点的完整 URL。" align="top">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'flex-end' }}>
          <input
            value={appriseDraft}
            onChange={e => setAppriseDraft(e.target.value)}
            onBlur={() => {
              const next = appriseDraft.trim();
              if (next !== (settings.appriseApiUrl ?? '')) {
                void patchSettings({ appriseApiUrl: next || null });
              }
            }}
            placeholder="http://localhost:8000/notify/apprise"
            style={{
              fontFamily: MONO, fontSize: 12, background: 'var(--onyx-panel2)', color: 'var(--onyx-text)',
              border: '1px solid var(--onyx-glass-edge)', borderRadius: 6, padding: '6px 10px',
              minWidth: 300, outline: 'none',
            }}
          />
          <Btn variant="ghost" onClick={() => void fireTest()} disabled={!hasApprise}>
            发送测试事件
          </Btn>
        </div>
      </Row>

      </Panel>

      {/* ── Notification rules ───────────────────────────────────────────── */}
      <Panel label="通知">

      {rules.length === 0 && editing !== 'new' && (
        <div style={{ fontSize: 12.5, color: 'var(--onyx-text-mute)', padding: '16px 0' }}>
          尚未配置通知。
        </div>
      )}

      {rules.map(rule => (
        <div
          key={rule.id}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            gap: 16, padding: '14px 0', borderBottom: '1px solid var(--onyx-line)',
          }}
        >
          <div style={{ minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{
                width: 7, height: 7, borderRadius: 4, flexShrink: 0,
                background: rule.enabled ? 'var(--onyx-accent)' : 'var(--onyx-text-mute)',
              }} />
              <span style={{ fontSize: 13.5, fontWeight: 500 }}>{rule.eventName}</span>
              {rule.lastAttemptFailed && (
                <span style={{ fontFamily: MONO, fontSize: 10, color: '#e08a8a' }}>上次发送失败</span>
              )}
            </div>
            <div style={{ fontSize: 11.5, color: 'var(--onyx-text-mute)', marginTop: 4, fontFamily: MONO, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 420 }}>
              {rule.urls.length} 个 URL
              {typeof rule.numTimesFired === 'number' ? ` · 已触发 ${rule.numTimesFired} 次` : ''}
              {' · '}{rule.type}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
            <Btn variant="ghost" onClick={() => rule.id && void testRule(rule.id)} disabled={!hasApprise}>测试</Btn>
            <Btn variant="ghost" onClick={() => setEditing(rule)}>编辑</Btn>
            <Btn variant="danger" onClick={() => rule.id && st.setConfirmDialog({
              title: '删除通知',
              message: `删除“${rule.eventName}”通知规则？此操作无法撤销。`,
              confirmLabel: '删除',
              onConfirm: () => void removeRule(rule.id!),
            })}>删除</Btn>
          </div>
        </div>
      ))}

      {/* Editor: shown for the rule being edited, or the create form. */}
      {editing && editing !== 'new' && (
        <RuleEditor
          initial={editing}
          events={events}
          libraries={libraries}
          onCancel={() => setEditing(null)}
          onSave={saveRule}
        />
      )}
      {editing === 'new' && (
        <RuleEditor
          initial={null}
          events={events}
          libraries={libraries}
          onCancel={() => setEditing(null)}
          onSave={saveRule}
        />
      )}

      {!editing && (
        <div style={{ marginTop: 14 }}>
          <Btn variant="accent" onClick={() => setEditing('new')}>+ 添加通知</Btn>
        </div>
      )}

      </Panel>

      {/* ── Advanced ─────────────────────────────────────────────────────── */}
      <Panel label="高级">

      <Row label="最大失败次数" hint="连续失败达到该次数后，通知会被自动禁用。">
        <NumField
          value={settings.maxFailedAttempts ?? 5}
          min={1} max={20}
          onCommit={v => void patchSettings({ maxFailedAttempts: v })}
        />
      </Row>
      <Row label="最大通知队列" hint="发送队列中最多可容纳的通知数，超出后新通知会被丢弃。">
        <NumField
          value={settings.maxNotificationQueue ?? 20}
          min={1} max={100}
          onCommit={v => void patchSettings({ maxNotificationQueue: v })}
        />
      </Row>
      <Row label="通知间隔" hint="两次通知发送之间的最小间隔。">
        <NumField
          value={settings.notificationDelay ?? 1000}
          min={0} max={60000} suffix="ms"
          onCommit={v => void patchSettings({ notificationDelay: v })}
        />
      </Row>
      </Panel>
    </div>
  );
}

// Numeric input that commits on blur (avoids a PATCH per keystroke).
function NumField({
  value, onCommit, min, max, suffix,
}: {
  value: number;
  onCommit: (v: number) => void;
  min?: number; max?: number; suffix?: string;
}) {
  const [local, setLocal] = useState(String(value));
  useEffect(() => setLocal(String(value)), [value]);
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <input
        type="number"
        value={local}
        min={min}
        max={max}
        onChange={e => setLocal(e.target.value)}
        onBlur={() => {
          const n = parseInt(local, 10);
          if (!isNaN(n) && n !== value) onCommit(n);
        }}
        style={{
          fontFamily: MONO, fontSize: 11, background: 'var(--onyx-panel2)', color: 'var(--onyx-text)',
          border: '1px solid var(--onyx-glass-edge)', borderRadius: 6, padding: '5px 10px',
          width: 80, textAlign: 'right' as const,
        }}
      />
      {suffix && <span style={{ fontFamily: MONO, fontSize: 11, color: 'var(--onyx-text-dim)' }}>{suffix}</span>}
    </div>
  );
}
