import { useState, useEffect, useCallback } from 'react';
import type { OnyxState } from '../../state/onyx';
import { getTasks, validateCron, type Task } from '../../api/abs';
import { SectionHead, Row, MONO, Panel } from './shared';
import CronEditor from './CronEditor';

export interface ScheduledTasksSectionProps { st: OnyxState; }

// Poll interval for the activity monitor while the panel is open.
const POLL_MS = 3000;

// ── Helpers ─────────────────────────────────────────────────────────────────────

/** Compact "Ns ago" / "Nm ago" / "Nh ago" relative time from a ms-epoch value. */
function relTime(ms: number | null | undefined): string {
  if (!ms) return '';
  const diff = Date.now() - ms;
  if (diff < 0) return '刚刚';
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s} 秒前`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} 分钟前`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} 小时前`;
  return `${Math.floor(h / 24)} 天前`;
}

/** Capitalize the first letter for display. */
const cap = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

/** Minimal human-readable description for the most common cron patterns. */
function describeCron(expr: string): string {
  const parts = expr.trim().split(/\s+/);
  if (parts.length !== 5) return '自定义计划';
  const [min, hr, dom, , dow] = parts;
  if (expr === '0 * * * *') return '每小时';
  if (min !== '*' && hr === '*' && dom === '*' && dow === '*') return `每小时第 ${min.padStart(2, '0')} 分`;
  if (min !== '*' && hr !== '*' && dom === '*' && dow === '*') return `每天 ${hr.padStart(2, '0')}:${min.padStart(2, '0')}`;
  if (dom === '*' && dow !== '*') return `每周（第 ${dow} 天）${hr.padStart(2, '0')}:${min.padStart(2, '0')}`;
  return '自定义计划';
}

// Status presentation for a task: dot colour + label.
function taskStatus(t: Task): { color: string; label: string } {
  if (!t.isFinished) return { color: '#f59e0b', label: '运行中' };
  if (t.isFailed)   return { color: '#e08a8a', label: '失败' };
  return { color: '#4caf50', label: '已完成' };
}

// ── Main section ────────────────────────────────────────────────────────────────

export default function ScheduledTasksSection({ st }: ScheduledTasksSectionProps) {
  // Hook-free admin guard wrapper — see BackupSection for the rationale
  // (an early return between hooks crashes React if isAdmin flips).
  if (!st.isAdmin) return null;
  return <ScheduledTasksSectionInner st={st} />;
}

function ScheduledTasksSectionInner({ st }: ScheduledTasksSectionProps) {
  // The task list lives in onyx state (st.tasks), kept current by socket events
  // even while this pane is closed. This panel only seeds it and renders it.
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Cron builder/validator state — seeded with a valid default so the picker
  // opens in a friendly mode rather than empty Custom.
  const [cronInput, setCronInput] = useState('0 * * * *');
  const [cronValid, setCronValid] = useState<boolean | null>(null);
  const [cronChecking, setCronChecking] = useState(false);

  // Live sync drives the socket task events that keep st.tasks current. When it's
  // off there are no task events, so this panel polls as a fallback instead.
  const liveSyncOn = localStorage.getItem('onyx.sync.live') === 'true';

  // seed(silent): refresh st.tasks from GET /api/tasks. silent skips the spinner.
  const seed = useCallback(async (silent: boolean) => {
    if (!silent) setLoading(true);
    try {
      const resp = await getTasks(st.serverUrl);
      st.setTasks(resp.tasks);
      setError(null);
    } catch (e) {
      setError(String(e));
    } finally {
      if (!silent) setLoading(false);
    }
  // st.setTasks is a stable state setter; depend only on the server URL.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [st.serverUrl]);

  // Seed on mount; poll as a fallback only when live sync (socket) is off.
  useEffect(() => {
    void seed(false);
    if (liveSyncOn) return;
    const iv = setInterval(() => void seed(true), POLL_MS);
    return () => clearInterval(iv);
  }, [seed, liveSyncOn]);

  async function checkCron() {
    const expr = cronInput.trim();
    if (!expr) { setCronValid(null); return; }
    setCronChecking(true);
    try {
      const ok = await validateCron(st.serverUrl, expr);
      setCronValid(ok);
    } catch {
      setCronValid(false);
    } finally {
      setCronChecking(false);
    }
  }

  // Running tasks first, then most-recently-active. Sort key: running before
  // finished, then by the relevant timestamp descending.
  const sorted = [...st.tasks].sort((a, b) => {
    if (a.isFinished !== b.isFinished) return a.isFinished ? 1 : -1;
    const ta = a.finishedAt ?? a.startedAt ?? 0;
    const tb = b.finishedAt ?? b.startedAt ?? 0;
    return tb - ta;
  });

  // Schedule summary, read from server settings.
  const backupSchedule = st.serverSettings?.backupSchedule;
  const backupEnabled = typeof backupSchedule === 'string' && backupSchedule.length > 0;
  const podcastSchedule = st.serverSettings?.podcastEpisodeSchedule ?? null;

  return (
    <div>
      <SectionHead
        title="计划任务"
        subtitle="服务器的后台活动及其驱动计划。仅限管理员。"
      />

      {/* ── Activity monitor ─────────────────────────────────────────────── */}
      <Panel label="活动">

      {!liveSyncOn && (
        <div style={{ fontSize: 11.5, color: 'var(--onyx-text-mute)', padding: '10px 0 2px', lineHeight: 1.5 }}>
          实时同步已关闭——本面板打开期间每 {POLL_MS / 1000} 秒刷新一次任务。
          启用实时同步（设置 → 服务器）可获得跨面板保持的实时更新。
        </div>
      )}

      {loading && (
        <div style={{ fontFamily: MONO, fontSize: 11, color: 'var(--onyx-text-mute)', padding: '14px 0' }}>
          正在加载任务…
        </div>
      )}

      {error && !loading && (
        <div style={{ fontFamily: MONO, fontSize: 11, color: 'var(--onyx-text-mute)', padding: '14px 0' }}>
          无法加载任务：{error}
        </div>
      )}

      {!loading && !error && sorted.length === 0 && (
        <div style={{ fontSize: 12.5, color: 'var(--onyx-text-mute)', padding: '14px 0' }}>
          当前没有活动或近期任务。后台操作（书库扫描、备份、元数据嵌入）运行时会显示在这里。
        </div>
      )}

      {sorted.map(t => {
        const status = taskStatus(t);
        const title = t.title || t.titleKey || t.action || '任务';
        const desc = t.description || t.descriptionKey || '';
        const when = t.isFinished ? relTime(t.finishedAt) : relTime(t.startedAt);
        return (
          <div
            key={t.id}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              gap: 16, padding: '12px 0', borderBottom: '1px solid var(--onyx-line)',
            }}
          >
            <div style={{ minWidth: 0, display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ width: 7, height: 7, borderRadius: 4, background: status.color, flexShrink: 0 }} />
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 500 }}>{title}</div>
                {(desc || t.error) && (
                  <div style={{
                    fontSize: 11.5, color: t.error ? '#e08a8a' : 'var(--onyx-text-mute)', marginTop: 3,
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 420,
                  }}>
                    {t.error || t.errorKey || desc}
                  </div>
                )}
              </div>
            </div>
            <div style={{ flexShrink: 0, textAlign: 'right' as const }}>
              <div style={{ fontFamily: MONO, fontSize: 10, color: status.color }}>
                {status.label}
                {/* Percent from the task_progress socket event. Only encode and
                    embed jobs report it, and ABS sends it to admins only, so an
                    absent bar means "not reported", never "stalled". */}
                {!t.isFinished && typeof t.progress === 'number' && ` ${Math.round(t.progress)}%`}
              </div>
              {!t.isFinished && typeof t.progress === 'number' && (
                <div style={{
                  width: 72, height: 3, borderRadius: 2, marginTop: 4, marginLeft: 'auto',
                  background: 'var(--onyx-line)', overflow: 'hidden',
                }}>
                  <div style={{
                    width: `${t.progress}%`, height: '100%', background: status.color,
                    transition: 'width 240ms linear',
                  }} />
                </div>
              )}
              {when && <div style={{ fontFamily: MONO, fontSize: 10, color: 'var(--onyx-text-mute)', marginTop: 2 }}>{when}</div>}
            </div>
          </div>
        );
      })}

      </Panel>

      {/* ── Schedule summary ─────────────────────────────────────────────── */}
      <Panel label="计划">

      <Row label="自动备份" hint="在“设置 → 备份”中编辑。">
        <span style={{ fontSize: 12.5, color: backupEnabled ? 'var(--onyx-text)' : 'var(--onyx-text-mute)' }}>
          {backupEnabled ? cap(describeCron(backupSchedule as string)) : '已禁用'}
        </span>
      </Row>

      <Row label="播客单集检查" hint="在“设置 → 服务器”中编辑。">
        <span style={{ fontSize: 12.5, color: podcastSchedule ? 'var(--onyx-text)' : 'var(--onyx-text-mute)' }}>
          {podcastSchedule ? cap(describeCron(podcastSchedule)) : '—'}
        </span>
      </Row>

      </Panel>

      {/* ── Cron builder & validator ─────────────────────────────────────── */}
      <Panel label="Cron 构建器">

      <Row
        label="构建计划"
        hint="使用选择器构造 cron 表达式。自定义模式可输入原始 cron，并可向服务器校验。"
        align="top"
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'flex-end' }}>
          <CronEditor value={cronInput} onChange={v => { setCronInput(v); setCronValid(null); }} />
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            {cronValid !== null && (
              <span style={{ fontFamily: MONO, fontSize: 11, color: cronValid ? '#4caf50' : '#e08a8a' }}>
                {cronValid ? '✓ 有效' : '✕ 表达式无效'}
              </span>
            )}
            <button
              onClick={() => void checkCron()}
              disabled={cronChecking || !cronInput.trim()}
              style={{
                fontFamily: MONO, fontSize: 11, padding: '6px 12px', borderRadius: 6,
                background: 'var(--onyx-accent-dim)', border: '1px solid var(--onyx-accent-edge)',
                color: 'var(--onyx-accent)', cursor: cronChecking || !cronInput.trim() ? 'default' : 'pointer',
                opacity: cronChecking || !cronInput.trim() ? 0.45 : 1,
              }}
            >
              校验
            </button>
          </div>
        </div>
      </Row>
      </Panel>
    </div>
  );
}
