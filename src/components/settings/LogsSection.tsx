import { useState, useEffect, useRef, useCallback } from 'react';
import { listen } from '@tauri-apps/api/event';
import type { OnyxState } from '../../state/onyx';
import { getLoggerData, startLogStream, stopLogStream, LOGGER_LEVELS, readSkaldLog, openLogDir, type LogEntry } from '../../api/abs';
import { SectionHead, MONO, Panel, Seg } from './shared';
import { getLogBuffer, subscribeLog, clearLogBuffer, type LogCategory, type LogLevel } from '../../lib/log';

export interface LogsSectionProps { st: OnyxState; }

// ── Skald app-log subtab ──────────────────────────────────────────────────────
// Reads the in-memory ring buffer (current session) from src/lib/log; "Full file"
// loads the on-disk skald.log via the Rust command.
const SKALD_LEVELS: { value: LogLevel; label: string; rank: number; color: string }[] = [
  { value: 'debug', label: 'Debug', rank: 0, color: 'var(--onyx-text-mute)' },
  { value: 'info',  label: 'Info',  rank: 1, color: 'var(--onyx-text-dim)' },
  { value: 'warn',  label: 'Warn',  rank: 2, color: '#f59e0b' },
  { value: 'error', label: 'Error', rank: 3, color: '#e08a8a' },
];
const LEVEL_RANK: Record<LogLevel, number> = { debug: 0, info: 1, warn: 2, error: 3 };
const SKALD_CATS: Array<LogCategory | 'all'> = ['all', 'app', 'auth', 'library', 'playback', 'sync', 'downloads', 'sharing', 'metadata'];

function SkaldLogPanel() {
  // Re-render when the ring buffer changes.
  const [, force] = useState(0);
  useEffect(() => subscribeLog(() => force(n => n + 1)), []);

  const [minRank, setMinRank] = useState(0); // show everything by default
  const [cat, setCat] = useState<LogCategory | 'all'>('all');
  const [search, setSearch] = useState('');
  const [autoScroll, setAutoScroll] = useState(true);
  const [fullFile, setFullFile] = useState<string | null>(null); // null = live buffer view
  const scrollRef = useRef<HTMLDivElement>(null);

  const inputStyle = { fontFamily: MONO, fontSize: 11, background: 'var(--onyx-panel2)', color: 'var(--onyx-text)', border: '1px solid var(--onyx-glass-edge)', borderRadius: 6, padding: '5px 8px' } as const;

  const entries = getLogBuffer();
  const q = search.toLowerCase();
  const filtered = entries.filter(e =>
    LEVEL_RANK[e.level] >= minRank &&
    (cat === 'all' || e.cat === cat) &&
    (q === '' || e.msg.toLowerCase().includes(q) || e.cat.includes(q)),
  );

  useEffect(() => {
    if (autoScroll && fullFile === null && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [filtered.length, autoScroll, fullFile]);

  const colorFor = (lvl: LogLevel) => SKALD_LEVELS.find(l => l.value === lvl)?.color ?? 'var(--onyx-text)';
  const fmtTs = (ts: number) => `${new Date(ts).toLocaleTimeString(undefined, { hour12: false })}.${String(ts % 1000).padStart(3, '0')}`;

  return (
    <Panel label="Skald 应用日志">
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', padding: '10px 0 14px' }}>
        <select value={minRank} onChange={e => setMinRank(Number(e.target.value))} style={{ ...inputStyle, cursor: 'pointer' }}>
          {SKALD_LEVELS.map(l => <option key={l.value} value={l.rank}>{l.label}+</option>)}
        </select>
        <select value={cat} onChange={e => setCat(e.target.value as LogCategory | 'all')} style={{ ...inputStyle, cursor: 'pointer' }}>
          {SKALD_CATS.map(c => <option key={c} value={c}>{c === 'all' ? '全部分类' : c}</option>)}
        </select>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="筛选文本…" style={{ ...inputStyle, flex: 1, minWidth: 140 }} />
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5, color: 'var(--onyx-text-dim)', cursor: 'pointer' }}>
          <input type="checkbox" checked={autoScroll} onChange={e => setAutoScroll(e.target.checked)} />
          自动滚动
        </label>
        <button onClick={() => clearLogBuffer()} style={{ ...inputStyle, cursor: 'pointer', color: 'var(--onyx-text-dim)' }}>清空</button>
        <button
          onClick={() => {
            if (fullFile !== null) { setFullFile(null); return; }
            readSkaldLog().then(setFullFile).catch(err => setFullFile(`读取日志文件失败：${String(err)}`));
          }}
          style={{ ...inputStyle, cursor: 'pointer', color: fullFile !== null ? 'var(--onyx-accent)' : 'var(--onyx-text-dim)', borderColor: fullFile !== null ? 'var(--onyx-accent-edge)' : 'var(--onyx-glass-edge)' }}
        >
          {fullFile !== null ? '实时缓冲' : '完整文件'}
        </button>
        <button onClick={() => { void openLogDir(); }} style={{ ...inputStyle, cursor: 'pointer', color: 'var(--onyx-text-dim)' }}>打开文件夹</button>
      </div>

      <div
        ref={scrollRef}
        className="onyx-selectable"
        style={{ maxHeight: '58vh', overflowY: 'auto', background: 'var(--onyx-bg-deep)', border: '1px solid var(--onyx-glass-edge)', borderRadius: 8, padding: '8px 10px', fontFamily: MONO, fontSize: 11, lineHeight: 1.6 }}
      >
        {fullFile !== null ? (
          fullFile.trim() === ''
            ? <div style={{ color: 'var(--onyx-text-mute)' }}>日志文件为空。</div>
            : <pre style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word', color: 'var(--onyx-text)' }}>{fullFile}</pre>
        ) : filtered.length === 0 ? (
          <div style={{ color: 'var(--onyx-text-mute)' }}>本次会话没有日志条目。</div>
        ) : filtered.map((e, i) => (
          <div key={i} style={{ display: 'flex', gap: 8, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
            <span style={{ color: 'var(--onyx-text-mute)', flexShrink: 0 }}>{fmtTs(e.ts)}</span>
            <span style={{ color: colorFor(e.level), flexShrink: 0, minWidth: 40, textTransform: 'uppercase' }}>{e.level}</span>
            <span style={{ color: 'var(--onyx-accent)', flexShrink: 0, minWidth: 64 }}>{e.cat}</span>
            <span style={{ color: 'var(--onyx-text)' }}>{e.msg}</span>
          </div>
        ))}
      </div>

      <div style={{ fontSize: 11, color: 'var(--onyx-text-mute)', marginTop: 12, paddingBottom: 4 }}>
        {fullFile !== null
          ? '正在显示磁盘上的日志文件（skald.log）。'
          : `正在显示缓冲区中的 ${filtered.length} / ${entries.length} 条日志（当前会话）。完整历史记录在日志文件中。`}
      </div>
    </Panel>
  );
}

// Cap the in-memory buffer — logs can be high-volume.
const MAX_LOGS = 2000;

// LogLevel numerics (server/utils/constants.js): TRACE=0, DEBUG=1, INFO=2,
// WARN=3, ERROR=4, FATAL=5, NOTE=6. The "FATAL only" preset (cluster L — there is
// no crash-log endpoint, so crash-level lines are isolated here in the daily log)
// matches FATAL exactly, NOT FATAL-and-above, since NOTE(6) sorts above FATAL.
const FATAL_LEVEL = 5;

const colorForLevel = (level: number) =>
  LOGGER_LEVELS.find(l => l.value === level)?.color ?? 'var(--onyx-text)';

export default function LogsSection({ st }: LogsSectionProps) {
  // Hook-free admin guard wrapper — see BackupSection for the rationale
  // (an early return between hooks crashes React if isAdmin flips).
  if (!st.isAdmin) return null;
  return <LogsSectionInner st={st} />;
}

function LogsSectionInner({ st }: LogsSectionProps) {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [minLevel, setMinLevel] = useState(2); // Info and above by default
  const [fatalOnly, setFatalOnly] = useState(false); // crash-level preset (cluster L)
  const [search, setSearch] = useState('');
  const [autoScroll, setAutoScroll] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  // Which log source is shown — persisted like other subtab choices.
  const [subtab, setSubtab] = useState<'server' | 'skald'>(
    () => (localStorage.getItem('onyx.logs.subtab') === 'skald' ? 'skald' : 'server'),
  );
  const switchSubtab = (t: 'server' | 'skald') => { localStorage.setItem('onyx.logs.subtab', t); setSubtab(t); };

  // The live tail rides the live-sync socket; without it we only have the seed.
  const liveSyncOn = localStorage.getItem('onyx.sync.live') === 'true';

  // Seed the current day's recent entries via HTTP.
  const seed = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getLoggerData(st.serverUrl);
      setLogs(data.currentDailyLogs);
      setError(null);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, [st.serverUrl]);

  useEffect(() => { void seed(); }, [seed]);

  // Live tail: register the socket as a log listener at minLevel and append
  // 'server-log' events. Re-runs when minLevel changes (re-registers at the new
  // level). Only active when live sync is connected.
  useEffect(() => {
    if (!liveSyncOn) return;
    let unlisten: (() => void) | undefined;
    let active = true;
    void startLogStream(minLevel);
    listen<string>('server-log', e => {
      try {
        const entry = JSON.parse(e.payload) as LogEntry;
        setLogs(prev => {
          const next = [...prev, entry];
          return next.length > MAX_LOGS ? next.slice(next.length - MAX_LOGS) : next;
        });
      } catch { /* ignore malformed log payload */ }
    }).then(fn => { if (active) unlisten = fn; else fn(); });
    return () => {
      active = false;
      unlisten?.();
      void stopLogStream();
    };
  }, [liveSyncOn, minLevel, st.serverUrl]);

  // Client-side view: respect the level filter (covers the seed too) + search.
  // The FATAL-only preset overrides the min-level dropdown and matches FATAL
  // exactly (crash-level isolation — cluster L).
  const filtered = logs.filter(l =>
    (fatalOnly ? l.level === FATAL_LEVEL : l.level >= minLevel) &&
    (search === '' ||
      l.message.toLowerCase().includes(search.toLowerCase()) ||
      l.source.toLowerCase().includes(search.toLowerCase()))
  );

  // Pin to the bottom as new lines arrive when auto-scroll is on.
  useEffect(() => {
    if (autoScroll && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [filtered.length, autoScroll]);

  const inputStyle = {
    fontFamily: MONO, fontSize: 11, background: 'var(--onyx-panel2)', color: 'var(--onyx-text)',
    border: '1px solid var(--onyx-glass-edge)', borderRadius: 6, padding: '5px 8px',
  } as const;

  return (
    <div>
      <SectionHead title="日志" subtitle="用于排查故障的服务器与 Skald 应用日志。仅管理员可用。" />

      {/* Source switcher: Audiobookshelf server log vs Skald's own app log */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 4 }}>
        <Seg active={subtab === 'server'} onClick={() => switchSubtab('server')}>服务器</Seg>
        <Seg active={subtab === 'skald'} onClick={() => switchSubtab('skald')}>Skald</Seg>
      </div>

      {subtab === 'skald' && <SkaldLogPanel />}

      {subtab === 'server' && (
      <Panel label="服务器日志">
      {/* Controls */}
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', padding: '10px 0 14px' }}>
        <select
          value={minLevel}
          onChange={e => setMinLevel(Number(e.target.value))}
          disabled={fatalOnly}
          title={fatalOnly ? '启用“仅 FATAL”时不可用' : undefined}
          style={{ ...inputStyle, cursor: fatalOnly ? 'default' : 'pointer', opacity: fatalOnly ? 0.5 : 1 }}
        >
          {LOGGER_LEVELS.map(l => <option key={l.value} value={l.value}>{l.label}+</option>)}
        </select>
        {/* FATAL-only preset — isolates crash-level lines (cluster L; ABS has no
            crash-log endpoint, so these surface via the normal daily log). */}
        <button
          onClick={() => setFatalOnly(v => !v)}
          title="仅显示 FATAL（崩溃级别）条目"
          style={{
            ...inputStyle, cursor: 'pointer',
            background: fatalOnly ? 'var(--onyx-accent-dim)' : 'var(--onyx-panel2)',
            color: fatalOnly ? 'var(--onyx-accent)' : 'var(--onyx-text-dim)',
            border: `1px solid ${fatalOnly ? 'var(--onyx-accent-edge)' : 'var(--onyx-glass-edge)'}`,
            fontWeight: fatalOnly ? 600 : 400,
          }}
        >
          仅 FATAL
        </button>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="筛选文本…"
          style={{ ...inputStyle, flex: 1, minWidth: 160 }}
        />
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5, color: 'var(--onyx-text-dim)', cursor: 'pointer' }}>
          <input type="checkbox" checked={autoScroll} onChange={e => setAutoScroll(e.target.checked)} />
          自动滚动
        </label>
        <button
          onClick={() => setLogs([])}
          style={{ ...inputStyle, cursor: 'pointer', color: 'var(--onyx-text-dim)' }}
        >
          清空
        </button>
      </div>

      {!liveSyncOn && (
        <div style={{ fontSize: 11.5, color: 'var(--onyx-text-mute)', padding: '0 0 10px', lineHeight: 1.5 }}>
          实时日志已关闭——仅显示当天最近的部分日志。启用实时同步（设置 → 服务器）即可流式查看新增日志行。
        </div>
      )}

      {loading && (
        <div style={{ fontFamily: MONO, fontSize: 11, color: 'var(--onyx-text-mute)', padding: '8px 0' }}>正在加载日志…</div>
      )}
      {error && !loading && (
        <div style={{ fontFamily: MONO, fontSize: 11, color: 'var(--onyx-text-mute)', padding: '8px 0' }}>
          无法加载日志：{error}
        </div>
      )}

      {/* Log list */}
      {!loading && !error && (
        <div
          ref={scrollRef}
          className="onyx-selectable"
          style={{
            maxHeight: '58vh', overflowY: 'auto',
            background: 'var(--onyx-bg-deep)', border: '1px solid var(--onyx-glass-edge)', borderRadius: 8,
            padding: '8px 10px', fontFamily: MONO, fontSize: 11, lineHeight: 1.6,
          }}
        >
          {filtered.length === 0 && (
            <div style={{ color: 'var(--onyx-text-mute)' }}>没有匹配的日志条目。</div>
          )}
          {filtered.map((l, i) => (
            <div key={`${l.timestamp}-${i}`} style={{ display: 'flex', gap: 8, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }} title={l.source}>
              <span style={{ color: 'var(--onyx-text-mute)', flexShrink: 0 }}>{l.timestamp}</span>
              <span style={{ color: colorForLevel(l.level), flexShrink: 0, minWidth: 42 }}>{l.levelName}</span>
              <span style={{ color: 'var(--onyx-text)' }}>{l.message}</span>
            </div>
          ))}
        </div>
      )}

      <div style={{ fontSize: 11, color: 'var(--onyx-text-mute)', marginTop: 12, paddingBottom: 4 }}>
        正在显示缓冲中的 {filtered.length} / {logs.length} 条日志。日志级别与保留策略在“设置 → 服务器 → 日志记录”中配置。
      </div>
      </Panel>
      )}
    </div>
  );
}
