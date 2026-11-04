import { useState, useEffect, useCallback } from 'react';
import { useI18n } from '../../i18n';
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
  if (diff < 0) return 'just now';
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

/** Capitalize the first letter for display. */
const cap = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

/** Minimal human-readable description for the most common cron patterns. */
function describeCron(expr: string): string {
  const parts = expr.trim().split(/\s+/);
  if (parts.length !== 5) return 'custom schedule';
  const [min, hr, dom, , dow] = parts;
  if (expr === '0 * * * *') return 'every hour';
  if (min !== '*' && hr === '*' && dom === '*' && dow === '*') return `hourly at :${min.padStart(2, '0')}`;
  if (min !== '*' && hr !== '*' && dom === '*' && dow === '*') return `daily at ${hr.padStart(2, '0')}:${min.padStart(2, '0')}`;
  if (dom === '*' && dow !== '*') return `weekly (day ${dow}) at ${hr.padStart(2, '0')}:${min.padStart(2, '0')}`;
  return 'custom schedule';
}

// Status presentation for a task: dot colour + label.
function taskStatus(t: Task): { color: string; label: string } {
  if (!t.isFinished) return { color: '#f59e0b', label: 'Running' };
  if (t.isFailed)   return { color: '#e08a8a', label: 'Failed' };
  return { color: '#4caf50', label: 'Done' };
}

// ── Main section ────────────────────────────────────────────────────────────────

export default function ScheduledTasksSection({ st }: ScheduledTasksSectionProps) {
  // Hook-free admin guard wrapper — see BackupSection for the rationale
  // (an early return between hooks crashes React if isAdmin flips).
  if (!st.isAdmin) return null;
  return <ScheduledTasksSectionInner st={st} />;
}

function ScheduledTasksSectionInner({ st }: ScheduledTasksSectionProps) {
  const { t } = useI18n();
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
        title={t('tasks.title')}
        subtitle="Background server activity and the schedules that drive it. Admin only."
      />

      {/* ── Activity monitor ─────────────────────────────────────────────── */}
      <Panel label={t('tasks.activity')}>

      {!liveSyncOn && (
        <div style={{ fontSize: 'var(--fs-2)', color: 'var(--onyx-text-mute)', padding: 'var(--s-3) 0 var(--s-1)', lineHeight: 1.5 }}>
          Live sync is off — tasks refresh every {POLL_MS / 1000}s while this panel is open.
          Enable live sync (Settings → Server) for real-time updates that persist across panels.
        </div>
      )}

      {loading && (
        <div style={{ fontFamily: MONO, fontSize: 'var(--fs-1)', color: 'var(--onyx-text-mute)', padding: 'var(--s-4) 0' }}>
          Loading tasks…
        </div>
      )}

      {error && !loading && (
        <div style={{ fontFamily: MONO, fontSize: 'var(--fs-1)', color: 'var(--onyx-text-mute)', padding: 'var(--s-4) 0' }}>
          Couldn't load tasks: {error}
        </div>
      )}

      {!loading && !error && sorted.length === 0 && (
        <div style={{ fontSize: 'var(--fs-2)', color: 'var(--onyx-text-mute)', padding: 'var(--s-4) 0' }}>
          No active or recent tasks. Background operations (library scans, backups, metadata embeds) will appear here while they run.
        </div>
      )}

      {sorted.map(t => {
        const status = taskStatus(t);
        const title = t.title || t.titleKey || t.action || 'Task';
        const desc = t.description || t.descriptionKey || '';
        const when = t.isFinished ? relTime(t.finishedAt) : relTime(t.startedAt);
        return (
          <div
            key={t.id}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              gap: 'var(--s-4)', padding: 'var(--s-3) 0', borderBottom: '1px solid var(--onyx-line)',
            }}
          >
            <div style={{ minWidth: 0, display: 'flex', alignItems: 'center', gap: 'var(--s-3)' }}>
              <span style={{ width: 7, height: 7, borderRadius: 'var(--r-xs)', background: status.color, flexShrink: 0 }} />
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 'var(--fs-3)', fontWeight: 500 }}>{title}</div>
                {(desc || t.error) && (
                  <div style={{
                    fontSize: 'var(--fs-2)', color: t.error ? '#e08a8a' : 'var(--onyx-text-mute)', marginTop: 'var(--s-1)',
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 420,
                  }}>
                    {t.error || t.errorKey || desc}
                  </div>
                )}
              </div>
            </div>
            <div style={{ flexShrink: 0, textAlign: 'right' as const }}>
              <div style={{ fontFamily: MONO, fontSize: 'var(--fs-0)', color: status.color }}>
                {status.label}
                {/* Percent from the task_progress socket event. Only encode and
                    embed jobs report it, and ABS sends it to admins only, so an
                    absent bar means "not reported", never "stalled". */}
                {!t.isFinished && typeof t.progress === 'number' && ` ${Math.round(t.progress)}%`}
              </div>
              {!t.isFinished && typeof t.progress === 'number' && (
                <div style={{
                  width: 72, height: 3, borderRadius: 'var(--r-xs)', marginTop: 'var(--s-1)', marginLeft: 'auto',
                  background: 'var(--onyx-line)', overflow: 'hidden',
                }}>
                  <div style={{
                    width: `${t.progress}%`, height: '100%', background: status.color,
                    transition: 'width 240ms linear',
                  }} />
                </div>
              )}
              {when && <div style={{ fontFamily: MONO, fontSize: 'var(--fs-0)', color: 'var(--onyx-text-mute)', marginTop: 'var(--s-1)' }}>{when}</div>}
            </div>
          </div>
        );
      })}

      </Panel>

      {/* ── Schedule summary ─────────────────────────────────────────────── */}
      <Panel label={t('tasks.schedules')}>

      <Row label={t('tasks.autoBackups')} hint={t('tasks.autoBackupsHint')}>
        <span style={{ fontSize: 'var(--fs-2)', color: backupEnabled ? 'var(--onyx-text)' : 'var(--onyx-text-mute)' }}>
          {backupEnabled ? cap(describeCron(backupSchedule as string)) : 'Disabled'}
        </span>
      </Row>

      <Row label={t('tasks.episodeCheck')} hint={t('tasks.episodeCheckHint')}>
        <span style={{ fontSize: 'var(--fs-2)', color: podcastSchedule ? 'var(--onyx-text)' : 'var(--onyx-text-mute)' }}>
          {podcastSchedule ? cap(describeCron(podcastSchedule)) : '—'}
        </span>
      </Row>

      </Panel>

      {/* ── Cron builder & validator ─────────────────────────────────────── */}
      <Panel label={t('tasks.cronBuilder')}>

      <Row
        label={t('tasks.buildSchedule')}
        hint={t('tasks.buildScheduleHint')}
        align="top"
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-3)', alignItems: 'flex-end' }}>
          <CronEditor value={cronInput} onChange={v => { setCronInput(v); setCronValid(null); }} />
          <div style={{ display: 'flex', gap: 'var(--s-3)', alignItems: 'center' }}>
            {cronValid !== null && (
              <span style={{ fontFamily: MONO, fontSize: 'var(--fs-1)', color: cronValid ? '#4caf50' : '#e08a8a' }}>
                {cronValid ? '✓ valid' : '✕ invalid expression'}
              </span>
            )}
            <button
              onClick={() => void checkCron()}
              disabled={cronChecking || !cronInput.trim()}
              style={{
                fontFamily: MONO, fontSize: 'var(--fs-1)', padding: 'var(--s-2) var(--s-3)', borderRadius: 'var(--r-sm)',
                background: 'var(--onyx-accent-dim)', border: '1px solid var(--onyx-accent-edge)',
                color: 'var(--onyx-accent)', cursor: cronChecking || !cronInput.trim() ? 'default' : 'pointer',
                opacity: cronChecking || !cronInput.trim() ? 0.45 : 1,
              }}
            >
              {t('tasks.validate')}
            </button>
          </div>
        </div>
      </Row>
      </Panel>
    </div>
  );
}
