import { useState, useEffect, useCallback } from 'react';
import type { OnyxState } from '../../state/onyx';
import {
  getBackups,
  createBackup,
  deleteBackup,
  applyBackup,
  updateServerSettings,
  type Backup,
  type ServerSettings,
} from '../../api/abs';
import { SectionHead, Row, Toggle, MONO, Panel, DIM_GOLD } from './shared';
import ConfirmDialog from '../ui/ConfirmDialog';
import CronEditor from './CronEditor';

export interface BackupSectionProps { st: OnyxState; }

// Default cron used when the user first enables automatic backups (01:30 daily).
const DEFAULT_BACKUP_CRON = '30 1 * * *';

// ── Helpers ─────────────────────────────────────────────────────────────────────

function formatBytes(n: number): string {
  if (!n || n < 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.min(Math.floor(Math.log(n) / Math.log(1024)), units.length - 1);
  const v = n / Math.pow(1024, i);
  return `${v.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

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
        fontFamily: MONO, fontSize: 10, letterSpacing: '0.08em', textTransform: 'uppercase' as const,
        padding: '6px 13px', borderRadius: 6,
        background: palette.bg, border: `1px solid ${palette.border}`,
        color: palette.color, cursor: disabled ? 'default' : 'pointer',
        opacity: disabled ? 0.45 : 1, whiteSpace: 'nowrap',
      }}
    >
      {children}
    </button>
  );
}

/** Small gold outline pill (e.g. "Latest", "Admin only"). */
function Tag({ children }: { children: React.ReactNode }) {
  return (
    <span style={{
      fontFamily: MONO, fontSize: 9, letterSpacing: '0.1em', textTransform: 'uppercase',
      padding: '3px 8px', borderRadius: 5, background: 'var(--onyx-accent-dim)',
      border: '1px solid var(--onyx-accent-edge)', color: 'var(--onyx-accent)', whiteSpace: 'nowrap',
    }}>{children}</span>
  );
}

// Numeric input that commits on blur (avoids a PATCH per keystroke).
function NumField({
  value, onCommit, min, max, suffix, step,
}: {
  value: number;
  onCommit: (v: number) => void;
  min?: number; max?: number; suffix?: string; step?: number;
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
        step={step}
        onChange={e => setLocal(e.target.value)}
        onBlur={() => {
          const n = parseFloat(local);
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

// ── Main section ────────────────────────────────────────────────────────────────

export default function BackupSection({ st }: BackupSectionProps) {
  // Admin guard lives in this hook-free wrapper: an early return *between*
  // hooks inside the component would change its hook count if isAdmin flips
  // while mounted (React's "rendered fewer hooks than expected" crash). With
  // the wrapper, the inner admin-only component simply unmounts instead.
  if (!st.isAdmin) return null;
  return <BackupSectionInner st={st} />;
}

function BackupSectionInner({ st }: BackupSectionProps) {
  const [backups, setBackups] = useState<Backup[]>([]);
  const [location, setLocation] = useState('');
  const [pathEnvSet, setPathEnvSet] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Pending confirmation dialog (delete or restore), or null.
  const [confirm, setConfirm] = useState<{ kind: 'delete' | 'restore'; backup: Backup } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const resp = await getBackups(st.serverUrl);
      setBackups(resp.backups);
      setLocation(resp.backupLocation);
      setPathEnvSet(resp.backupPathEnvSet);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, [st.serverUrl]);

  useEffect(() => { void load(); }, [load]);

  // ── Backup actions ────────────────────────────────────────────────────────

  async function doCreate() {
    setBusy(true);
    st.setToast({ message: '正在创建备份…', type: 'info' });
    try {
      const resp = await createBackup(st.serverUrl);
      setBackups(resp.backups);
      st.setToast({ message: '备份已创建。', type: 'success' });
    } catch (e) {
      st.setToast({ message: `备份失败：${e}`, type: 'error' });
    } finally {
      setBusy(false);
    }
  }

  async function doDelete(backup: Backup) {
    setBusy(true);
    try {
      const resp = await deleteBackup(st.serverUrl, backup.id);
      setBackups(resp.backups);
      st.setToast({ message: '备份已删除。', type: 'success' });
    } catch (e) {
      st.setToast({ message: `删除失败：${e}`, type: 'error' });
    } finally {
      setBusy(false);
    }
  }

  async function doRestore(backup: Backup) {
    setBusy(true);
    st.setToast({ message: '正在还原备份——服务器即将重启…', type: 'info' });
    try {
      await applyBackup(st.serverUrl, backup.id);
      st.setToast({ message: '还原已开始。Audiobookshelf 正在重启，请稍后重新连接。', type: 'success' });
    } catch (e) {
      st.setToast({ message: `还原失败：${e}`, type: 'error' });
    } finally {
      setBusy(false);
    }
  }

  // ── Schedule / retention config (lives in ServerSettings) ───────────────────

  async function patchSettings(partial: Partial<ServerSettings>) {
    try {
      const updated = await updateServerSettings(st.serverUrl, partial);
      st.setServerSettings(updated);
      st.setToast({ message: '备份设置已保存。', type: 'success' });
    } catch (e) {
      st.setToast({ message: `保存失败：${e}`, type: 'error' });
    }
  }

  // Current schedule state read from server settings. backupSchedule is a cron
  // string when enabled, or `false`/null when disabled.
  const schedule = st.serverSettings?.backupSchedule;
  const scheduleEnabled = typeof schedule === 'string' && schedule.length > 0;
  const cronValue = scheduleEnabled ? (schedule as string) : DEFAULT_BACKUP_CRON;

  // Newest snapshot (by creation time) — flagged with a "Latest" pill.
  const latestId = backups.reduce<Backup | null>(
    (latest, b) => (!latest || b.createdAt > latest.createdAt ? b : latest), null,
  )?.id;

  // ── Render ──────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div>
        <SectionHead title="备份" subtitle="数据库与元数据快照。备份不包含音频文件。" />
        <div style={{ fontFamily: MONO, fontSize: 11, color: 'var(--onyx-text-mute)', marginTop: 24 }}>
          正在加载备份…
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div>
        <SectionHead title="备份" subtitle="数据库与元数据快照。备份不包含音频文件。" />
        <div style={{
          fontFamily: MONO, fontSize: 11, color: 'var(--onyx-text-mute)', marginTop: 24,
          padding: '12px 16px', background: 'var(--onyx-glass)', borderRadius: 8,
          border: '1px solid var(--onyx-glass-edge)',
        }}>
          无法加载备份：{error}。
          <div style={{ marginTop: 10 }}><Btn variant="accent" onClick={() => void load()}>重试</Btn></div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <SectionHead
        title="备份"
        subtitle="数据库与元数据快照。备份不包含音频文件。"
      />

      {/* Admin-only badge */}
      <div style={{ marginBottom: 4 }}>
        <span style={{
          display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 10px', borderRadius: 6,
          background: 'var(--onyx-accent-dim)', border: '1px solid var(--onyx-accent-edge)', color: 'var(--onyx-accent)',
          fontFamily: MONO, fontSize: 9.5, letterSpacing: '0.1em', textTransform: 'uppercase',
        }}>★ 仅管理员</span>
      </div>

      {/* ── Snapshots ────────────────────────────────────────────────────── */}
      <Panel
        label="快照"
        action={<Btn variant="accent" onClick={() => void doCreate()} disabled={busy}>立即创建备份</Btn>}
      >
        {/* Count + on-disk location */}
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 14, padding: '12px 0', borderBottom: '1px solid var(--onyx-line)' }}>
          <span style={{ fontFamily: MONO, fontSize: 11, color: 'var(--onyx-text-dim)', letterSpacing: '0.04em' }}>
            {backups.length} 个快照
          </span>
          {location && (
            <span style={{ fontFamily: MONO, fontSize: 11, color: DIM_GOLD, letterSpacing: '0.04em', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {location}{pathEnvSet ? '（环境变量）' : ''}
            </span>
          )}
        </div>

        {backups.length === 0 && (
          <div style={{ fontFamily: MONO, fontSize: 11, color: 'var(--onyx-text-mute)', padding: '14px 0', letterSpacing: '0.04em' }}>
            还没有快照。
          </div>
        )}

        {backups.map((b, i) => (
          <div
            key={b.id}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              gap: 16, padding: '13px 0', borderBottom: i < backups.length - 1 ? '1px solid var(--onyx-line)' : 'none',
            }}
          >
            <div style={{ minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 14, fontWeight: 500, color: 'var(--onyx-text)' }}>{b.datePretty || b.id}</span>
                {b.id === latestId && <Tag>最新</Tag>}
              </div>
              <div style={{ display: 'flex', gap: 14, marginTop: 4, fontFamily: MONO, fontSize: 11, color: 'var(--onyx-text-mute)', letterSpacing: '0.03em' }}>
                <span>{formatBytes(b.fileSize)}</span>
                {b.serverVersion && <span>v{b.serverVersion}</span>}
                {b.key && <span>{b.key}</span>}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
              <Btn variant="ghost" onClick={() => setConfirm({ kind: 'restore', backup: b })} disabled={busy}>还原</Btn>
              <Btn variant="danger" onClick={() => setConfirm({ kind: 'delete', backup: b })} disabled={busy}>删除</Btn>
            </div>
          </div>
        ))}
      </Panel>

      {/* ── Schedule & retention ─────────────────────────────────────────── */}
      <Panel label="计划与保留">
        <Row label="自动备份" hint="按计划定期运行备份。">
          <Toggle
            on={scheduleEnabled}
            onChange={v => {
              // Enable → set a default cron; disable → false.
              void patchSettings({ backupSchedule: v ? DEFAULT_BACKUP_CRON : false });
            }}
          />
        </Row>

        {scheduleEnabled && (
          <Row label="计划" hint="自动备份的运行时间。" align="top">
            <CronEditor
              value={cronValue}
              onChange={v => void patchSettings({ backupSchedule: v })}
            />
          </Row>
        )}

        <Row label="保留快照数" hint="超过此数量的旧快照会被自动清理。">
          <NumField
            value={st.serverSettings?.backupsToKeep ?? 2}
            min={1} max={100}
            onCommit={v => void patchSettings({ backupsToKeep: v })}
          />
        </Row>

        <Row label="备份大小上限" hint="安全限制——超过此大小的备份会被中止。设为 0 可禁用。">
          <NumField
            value={st.serverSettings?.maxBackupSize ?? 1}
            min={0} max={1024} step={0.5} suffix="GB"
            onCommit={v => void patchSettings({ maxBackupSize: v })}
          />
        </Row>
      </Panel>

      {/* ── Confirm dialogs ──────────────────────────────────────────────── */}
      {confirm?.kind === 'delete' && (
        <ConfirmDialog
          title="删除此备份？"
          message={`永久删除来自 ${confirm.backup.datePretty || confirm.backup.id} 的备份？此操作无法撤销。`}
          confirmLabel="删除"
          danger
          onConfirm={() => { const b = confirm.backup; setConfirm(null); void doDelete(b); }}
          onCancel={() => setConfirm(null)}
        />
      )}
      {confirm?.kind === 'restore' && (
        <ConfirmDialog
          title="还原此备份？"
          message={`还原来自 ${confirm.backup.datePretty || confirm.backup.id} 的备份会覆盖服务器当前的数据库与元数据，然后重启 Audiobookshelf。你将被断开连接。此操作无法撤销。`}
          confirmLabel="还原并重启"
          danger
          onConfirm={() => { const b = confirm.backup; setConfirm(null); void doRestore(b); }}
          onCancel={() => setConfirm(null)}
        />
      )}
    </div>
  );
}
