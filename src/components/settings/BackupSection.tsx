import { useState, useEffect, useCallback } from 'react';
import { useI18n } from '../../i18n';
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
        fontFamily: MONO, fontSize: 'var(--fs-0)', letterSpacing: '0.08em', textTransform: 'uppercase' as const,
        padding: 'var(--s-2) var(--s-4)', borderRadius: 'var(--r-sm)',
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
      fontFamily: MONO, fontSize: 'var(--fs-0)', letterSpacing: '0.1em', textTransform: 'uppercase',
      padding: 'var(--s-1) var(--s-2)', borderRadius: 'var(--r-sm)', background: 'var(--onyx-accent-dim)',
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
    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--s-2)' }}>
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
          fontFamily: MONO, fontSize: 'var(--fs-1)', background: 'var(--surface-overlay)', color: 'var(--onyx-text)',
          border: '1px solid var(--onyx-glass-edge)', borderRadius: 'var(--r-sm)', padding: 'var(--s-1) var(--s-3)',
          width: 80, textAlign: 'right' as const,
        }}
      />
      {suffix && <span style={{ fontFamily: MONO, fontSize: 'var(--fs-1)', color: 'var(--onyx-text-dim)' }}>{suffix}</span>}
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
  const { t } = useI18n();
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
    st.setToast({ message: t('toastMsg.creatingBackup'), type: 'info' });
    try {
      const resp = await createBackup(st.serverUrl);
      setBackups(resp.backups);
      st.setToast({ message: t('toastMsg.backupCreated'), type: 'success' });
    } catch (e) {
      st.setToast({ message: t('toastMsg.backupFailed', { err: String(e) }), type: 'error' });
    } finally {
      setBusy(false);
    }
  }

  async function doDelete(backup: Backup) {
    setBusy(true);
    try {
      const resp = await deleteBackup(st.serverUrl, backup.id);
      setBackups(resp.backups);
      st.setToast({ message: t('toastMsg.backupDeleted'), type: 'success' });
    } catch (e) {
      st.setToast({ message: t('toastMsg.deleteFailedErr', { err: String(e) }), type: 'error' });
    } finally {
      setBusy(false);
    }
  }

  async function doRestore(backup: Backup) {
    setBusy(true);
    st.setToast({ message: t('toastMsg.restoringBackup'), type: 'info' });
    try {
      await applyBackup(st.serverUrl, backup.id);
      st.setToast({ message: t('toastMsg.restoreStarted'), type: 'success' });
    } catch (e) {
      st.setToast({ message: t('toastMsg.restoreFailed', { err: String(e) }), type: 'error' });
    } finally {
      setBusy(false);
    }
  }

  // ── Schedule / retention config (lives in ServerSettings) ───────────────────

  async function patchSettings(partial: Partial<ServerSettings>) {
    try {
      const updated = await updateServerSettings(st.serverUrl, partial);
      st.setServerSettings(updated);
      st.setToast({ message: t('toastMsg.backupSettingsSaved'), type: 'success' });
    } catch (e) {
      st.setToast({ message: t('toastMsg.saveFailedErr', { err: String(e) }), type: 'error' });
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
        <SectionHead title={t('backup.title')} subtitle="Database and metadata snapshots. Audio files are not included in backups." />
        <div style={{ fontFamily: MONO, fontSize: 'var(--fs-1)', color: 'var(--onyx-text-mute)', marginTop: 'var(--s-6)' }}>
          Loading backups…
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div>
        <SectionHead title={t('backup.title')} subtitle="Database and metadata snapshots. Audio files are not included in backups." />
        <div style={{
          fontFamily: MONO, fontSize: 'var(--fs-1)', color: 'var(--onyx-text-mute)', marginTop: 'var(--s-6)',
          padding: 'var(--s-3) var(--s-4)', background: 'var(--onyx-glass)', borderRadius: 'var(--r-md)',
          border: '1px solid var(--onyx-glass-edge)',
        }}>
          Couldn't load backups: {error}.
          <div style={{ marginTop: 'var(--s-3)' }}><Btn variant="accent" onClick={() => void load()}>{t('backup.retry')}</Btn></div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <SectionHead
        title={t('backup.title')}
        subtitle="Database and metadata snapshots. Audio files are not included in backups."
      />

      {/* Admin-only badge */}
      <div style={{ marginBottom: 'var(--s-1)' }}>
        <span style={{
          display: 'inline-flex', alignItems: 'center', gap: 'var(--s-2)', padding: 'var(--s-1) var(--s-3)', borderRadius: 'var(--r-sm)',
          background: 'var(--onyx-accent-dim)', border: '1px solid var(--onyx-accent-edge)', color: 'var(--onyx-accent)',
          fontFamily: MONO, fontSize: 'var(--fs-0)', letterSpacing: '0.1em', textTransform: 'uppercase',
        }}>★ Admin only</span>
      </div>

      {/* ── Snapshots ────────────────────────────────────────────────────── */}
      <Panel
        label={t('backup.snapshots')}
        action={<Btn variant="accent" onClick={() => void doCreate()} disabled={busy}>{t('backup.createNow')}</Btn>}
      >
        {/* Count + on-disk location */}
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 'var(--s-4)', padding: 'var(--s-3) 0', borderBottom: '1px solid var(--onyx-line)' }}>
          <span style={{ fontFamily: MONO, fontSize: 'var(--fs-1)', color: 'var(--onyx-text-dim)', letterSpacing: '0.04em' }}>
            {backups.length} snapshot{backups.length === 1 ? '' : 's'}
          </span>
          {location && (
            <span style={{ fontFamily: MONO, fontSize: 'var(--fs-1)', color: DIM_GOLD, letterSpacing: '0.04em', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {location}{pathEnvSet ? ' (env)' : ''}
            </span>
          )}
        </div>

        {backups.length === 0 && (
          <div style={{ fontFamily: MONO, fontSize: 'var(--fs-1)', color: 'var(--onyx-text-mute)', padding: 'var(--s-4) 0', letterSpacing: '0.04em' }}>
            {t('backup.empty')}
          </div>
        )}

        {backups.map((b, i) => (
          <div
            key={b.id}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              gap: 'var(--s-4)', padding: 'var(--s-4) 0', borderBottom: i < backups.length - 1 ? '1px solid var(--onyx-line)' : 'none',
            }}
          >
            <div style={{ minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--s-3)' }}>
                <span style={{ fontSize: 'var(--fs-4)', fontWeight: 500, color: 'var(--onyx-text)' }}>{b.datePretty || b.id}</span>
                {b.id === latestId && <Tag>{t('backup.latest')}</Tag>}
              </div>
              <div style={{ display: 'flex', gap: 'var(--s-4)', marginTop: 'var(--s-1)', fontFamily: MONO, fontSize: 'var(--fs-1)', color: 'var(--onyx-text-mute)', letterSpacing: '0.03em' }}>
                <span>{formatBytes(b.fileSize)}</span>
                {b.serverVersion && <span>v{b.serverVersion}</span>}
                {b.key && <span>{b.key}</span>}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 'var(--s-2)', flexShrink: 0 }}>
              <Btn variant="ghost" onClick={() => setConfirm({ kind: 'restore', backup: b })} disabled={busy}>{t('backup.restore')}</Btn>
              <Btn variant="danger" onClick={() => setConfirm({ kind: 'delete', backup: b })} disabled={busy}>{t('backup.delete')}</Btn>
            </div>
          </div>
        ))}
      </Panel>

      {/* ── Schedule & retention ─────────────────────────────────────────── */}
      <Panel label={t('backup.scheduleRetention')}>
        <Row label={t('backup.automatic')} hint={t('backup.automaticHint')}>
          <Toggle
            on={scheduleEnabled}
            onChange={v => {
              // Enable → set a default cron; disable → false.
              void patchSettings({ backupSchedule: v ? DEFAULT_BACKUP_CRON : false });
            }}
          />
        </Row>

        {scheduleEnabled && (
          <Row label={t('backup.schedule')} hint={t('backup.scheduleHint')} align="top">
            <CronEditor
              value={cronValue}
              onChange={v => void patchSettings({ backupSchedule: v })}
            />
          </Row>
        )}

        <Row label={t('backup.keepCount')} hint={t('backup.keepCountHint')}>
          <NumField
            value={st.serverSettings?.backupsToKeep ?? 2}
            min={1} max={100}
            onCommit={v => void patchSettings({ backupsToKeep: v })}
          />
        </Row>

        <Row label={t('backup.maxSize')} hint={t('backup.maxSizeHint')}>
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
          title={t('backup.deleteConfirm')}
          message={`Permanently delete the backup from ${confirm.backup.datePretty || confirm.backup.id}? This cannot be undone.`}
          confirmLabel="Delete"
          danger
          onConfirm={() => { const b = confirm.backup; setConfirm(null); void doDelete(b); }}
          onCancel={() => setConfirm(null)}
        />
      )}
      {confirm?.kind === 'restore' && (
        <ConfirmDialog
          title={t('backup.restoreConfirm')}
          message={`Restoring the backup from ${confirm.backup.datePretty || confirm.backup.id} overwrites the server's current database and metadata, then restarts Audiobookshelf. You will be disconnected. This cannot be undone.`}
          confirmLabel="Restore & restart"
          danger
          onConfirm={() => { const b = confirm.backup; setConfirm(null); void doRestore(b); }}
          onCancel={() => setConfirm(null)}
        />
      )}
    </div>
  );
}
