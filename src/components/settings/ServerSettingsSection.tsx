import { useState, useEffect } from 'react';
import type { OnyxState, ServerSettings } from '../../state/onyx';
import { SectionHead, Row, Toggle, MONO, SERIF, Panel } from './shared';
import {
  updateServerSettings,
  updateSortingPrefixes,
  COVER_PROVIDERS,
  LOG_LEVELS,
} from '../../api/abs';
import CronEditor from './CronEditor';

export interface ServerSettingsSectionProps {
  st: OnyxState;
  /** When true, render as a sub-section under the Server panel (a lighter
   *  divider heading) instead of a standalone panel with its own SectionHead. */
  embedded?: boolean;
}

// ── Internal helpers ──────────────────────────────────────────────────────────

function Dropdown<T extends string | number>({
  value,
  options,
  onChange,
}: {
  value: T | null | undefined;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <select
      value={value ?? ''}
      onChange={e => {
        const raw = e.target.value;
        const opt = options.find(o => String(o.value) === raw);
        if (opt) onChange(opt.value);
      }}
      style={{
        fontFamily: MONO, fontSize: 11,
        background: 'var(--onyx-panel2)',
        color: 'var(--onyx-text)',
        border: '1px solid var(--onyx-glass-edge)',
        borderRadius: 6, padding: '5px 10px', cursor: 'pointer',
        minWidth: 160,
      }}
    >
      {options.map(o => (
        <option key={String(o.value)} value={String(o.value)}>{o.label}</option>
      ))}
    </select>
  );
}

function NumInput({
  value, onChange, min, max, suffix,
}: {
  value: number | null | undefined;
  onChange: (v: number) => void;
  min?: number; max?: number; suffix?: string;
}) {
  const [local, setLocal] = useState(String(value ?? ''));

  useEffect(() => setLocal(String(value ?? '')), [value]);

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
          if (!isNaN(n)) onChange(n);
        }}
        style={{
          fontFamily: MONO, fontSize: 11,
          background: 'var(--onyx-panel2)',
          color: 'var(--onyx-text)',
          border: '1px solid var(--onyx-glass-edge)',
          borderRadius: 6, padding: '5px 10px',
          width: 64, textAlign: 'right' as const,
        }}
      />
      {suffix && <span style={{ fontFamily: MONO, fontSize: 11, color: 'var(--onyx-text-dim)' }}>{suffix}</span>}
    </div>
  );
}

// ── Prefix tag editor ─────────────────────────────────────────────────────────

function PrefixEditor({
  prefixes,
  onChange,
}: {
  prefixes: string[];
  onChange: (p: string[]) => void;
}) {
  const [input, setInput] = useState('');

  function add() {
    const v = input.trim().toLowerCase();
    if (v && !prefixes.includes(v)) onChange([...prefixes, v]);
    setInput('');
  }

  function remove(p: string) {
    onChange(prefixes.filter(x => x !== p));
  }

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap' as const, gap: 6, alignItems: 'center' }}>
      {prefixes.map(p => (
        <button
          key={p}
          onClick={() => remove(p)}
          title="点击移除"
          style={{
            fontFamily: MONO, fontSize: 11,
            background: 'var(--onyx-accent-dim)',
            border: '1px solid var(--onyx-accent-edge)',
            borderRadius: 6, padding: '4px 10px',
            color: 'var(--onyx-accent)',
            cursor: 'pointer',
          }}
        >
          {p} ✕
        </button>
      ))}
      <input
        value={input}
        onChange={e => setInput(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') add(); }}
        placeholder="+ 添加"
        style={{
          fontFamily: MONO, fontSize: 11,
          background: 'var(--onyx-panel2)',
          color: 'var(--onyx-text)',
          border: '1px solid var(--onyx-glass-edge)',
          borderRadius: 6, padding: '4px 10px',
          width: 80,
        }}
      />
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function ServerSettingsSection({ st, embedded = false }: ServerSettingsSectionProps) {
  // Hook-free admin guard wrapper — see BackupSection for the rationale
  // (an early return between hooks crashes React if isAdmin flips).
  if (!st.isAdmin) return null;
  return <ServerSettingsSectionInner st={st} embedded={embedded} />;
}

function ServerSettingsSectionInner({ st, embedded = false }: ServerSettingsSectionProps) {
  // Local copy of settings — mutated optimistically on each toggle/change.
  // Seeded from st.serverSettings, which is captured at login and refreshed on
  // every app launch via POST /api/authorize (ABS has no standalone GET endpoint
  // for server settings — they only ride along with the login/authorize payload).
  const [settings, setSettings] = useState<ServerSettings | null>(st.serverSettings);

  // Heading: a standalone SectionHead when used as its own panel, or a lighter
  // divider sub-heading when embedded under the Server panel.
  const head = embedded ? (
    <div style={{ marginTop: 32, paddingTop: 24, borderTop: '1px solid var(--onyx-line)', marginBottom: 8 }}>
      <div style={{ fontFamily: SERIF, fontSize: 18, fontWeight: 500 }}>服务器管理</div>
      <div style={{ marginTop: 4, fontSize: 12.5, color: 'var(--onyx-text-dim)' }}>
        Audiobookshelf 服务器的全局配置。仅限管理员。
      </div>
    </div>
  ) : (
    <SectionHead title="服务器设置" subtitle="Audiobookshelf 服务器的全局配置。仅限管理员。" />
  );

  // Keep local state in sync if the parent state is updated externally
  // (e.g. a successful PATCH updates st.serverSettings via setServerSettings).
  useEffect(() => {
    if (st.serverSettings) setSettings(st.serverSettings);
  }, [st.serverSettings]);

  // ── Per-field update helpers ──────────────────────────────────────────────

  async function patch(partial: Partial<ServerSettings>) {
    try {
      const updated = await updateServerSettings(st.serverUrl, partial);
      setSettings(updated);
      st.setServerSettings(updated);
      st.setToast({ message: '服务器设置已保存。', type: 'success' });
    } catch (e) {
      st.setToast({ message: `保存失败：${e}`, type: 'error' });
    }
  }

  async function patchPrefixes(prefixes: string[]) {
    try {
      const updated = await updateSortingPrefixes(st.serverUrl, prefixes);
      setSettings(updated);
      st.setServerSettings(updated);
      st.setToast({ message: '排序前缀已更新，已在服务器上触发重新索引。', type: 'success' });
    } catch (e) {
      st.setToast({ message: `保存失败：${e}`, type: 'error' });
    }
  }

  // Settings come from the login payload — if null here it means the user
  // logged in before this feature was added. A fresh sign-in will populate them.
  if (!settings) {
    return (
      <div>
        {head}
        <div style={{
          fontFamily: MONO, fontSize: 11,
          color: 'var(--onyx-text-mute)',
          marginTop: 24,
          padding: '12px 16px',
          background: 'var(--onyx-glass)',
          borderRadius: 8,
          border: '1px solid var(--onyx-glass-edge)',
        }}>
          正在加载服务器设置… 若一直如此，请检查服务器连接后重新打开此面板。
        </div>
      </div>
    );
  }

  const s = settings ?? {};
  const prefixes = s.sortingPrefixes ?? ['the', 'a'];

  const coverProviderOptions = COVER_PROVIDERS.map(p => ({ value: p, label: p.charAt(0).toUpperCase() + p.slice(1) }));
  // Numeric log level (0=Debug, 1=Info, 2=Warn) — display-only Chinese labels;
  // the numeric value is what gets stored on the server.
  const LOG_LEVEL_LABELS: Record<number, string> = { 0: '调试', 1: '信息', 2: '警告' };
  const logLevelOptions = LOG_LEVELS.map(l => ({ value: l.value, label: LOG_LEVEL_LABELS[l.value] ?? l.label }));

  return (
    <div>
      {head}

      {/* ── Scanner ──────────────────────────────────────────────────────── */}
      <Panel label="扫描">

      <Row
        label="在线查找封面"
        hint="扫描书库时，自动从所选提供方下载封面图片。"
      >
        <Toggle
          on={s.scannerFindCovers ?? false}
          onChange={v => {
            setSettings(prev => ({ ...prev, scannerFindCovers: v }));
            patch({ scannerFindCovers: v });
          }}
        />
      </Row>

      <Row label="封面提供方" hint="自动下载封面时使用的来源。">
        <Dropdown
          value={s.scannerCoverProvider ?? 'google'}
          options={coverProviderOptions}
          onChange={v => {
            setSettings(prev => ({ ...prev, scannerCoverProvider: v }));
            patch({ scannerCoverProvider: v });
          }}
        />
      </Row>

      <Row
        label="从书名解析副标题"
        hint="当文件名含冒号或短横线分隔符时，提取其中的副标题。"
      >
        <Toggle
          on={s.scannerParseSubtitle ?? false}
          onChange={v => {
            setSettings(prev => ({ ...prev, scannerParseSubtitle: v }));
            patch({ scannerParseSubtitle: v });
          }}
        />
      </Row>

      <Row
        label="优先使用已匹配的元数据"
        hint="扫描时优先采用之前匹配的元数据，而不重新读取文件标签。"
      >
        <Toggle
          on={s.scannerPreferMatchedMetadata ?? false}
          onChange={v => {
            setSettings(prev => ({ ...prev, scannerPreferMatchedMetadata: v }));
            patch({ scannerPreferMatchedMetadata: v });
          }}
        />
      </Row>

      <Row
        label="停用文件夹监视"
        hint="停止监视书库文件夹的文件系统变化，此后需手动触发扫描。"
      >
        <Toggle
          on={s.scannerDisableWatcher ?? false}
          onChange={v => {
            setSettings(prev => ({ ...prev, scannerDisableWatcher: v }));
            patch({ scannerDisableWatcher: v });
          }}
        />
      </Row>

      </Panel>

      {/* ── Metadata storage ─────────────────────────────────────────────── */}
      <Panel label="元数据存储">

      <Row
        label="封面随条目一起存储"
        hint="将封面图片文件保存到服务器磁盘上每个条目的文件夹内。"
      >
        <Toggle
          on={s.storeCoverWithItem ?? false}
          onChange={v => {
            setSettings(prev => ({ ...prev, storeCoverWithItem: v }));
            patch({ storeCoverWithItem: v });
          }}
        />
      </Row>

      <Row
        label="元数据随条目一起存储"
        hint="将 metadata.json 文件保存到服务器磁盘上每个条目的文件夹内。"
      >
        <Toggle
          on={s.storeMetadataWithItem ?? false}
          onChange={v => {
            setSettings(prev => ({ ...prev, storeMetadataWithItem: v }));
            patch({ storeMetadataWithItem: v });
          }}
        />
      </Row>

      </Panel>

      {/* ── Sorting ──────────────────────────────────────────────────────── */}
      <Panel label="排序">

      <Row
        label="忽略排序前缀"
        hint='排序时将“The Great Gatsby”归入 G，而不是 T。'
      >
        <Toggle
          on={s.sortingIgnorePrefix ?? false}
          onChange={v => {
            setSettings(prev => ({ ...prev, sortingIgnorePrefix: v }));
            patch({ sortingIgnorePrefix: v });
          }}
        />
      </Row>

      {/* Prefix list is only relevant when prefix-ignoring is on — hide it
          otherwise to avoid implying it has any effect. */}
      {(s.sortingIgnorePrefix ?? false) && (
        <Row
          label="前缀"
          hint="点击某个前缀可将其移除，按 Enter 添加。保存后触发一次完整的标题重新索引。"
          align="top"
        >
          <PrefixEditor
            prefixes={prefixes}
            onChange={newPrefixes => {
              setSettings(prev => ({ ...prev, sortingPrefixes: newPrefixes }));
              patchPrefixes(newPrefixes);
            }}
          />
        </Row>
      )}

      </Panel>

      {/* ── Podcasts ─────────────────────────────────────────────────────── */}
      <Panel label="播客">

      <Row
        label="单集检查计划"
        hint="检查播客新单集的频率。默认：每小时。"
        align="top"
      >
        <CronEditor
          value={s.podcastEpisodeSchedule ?? '0 * * * *'}
          onChange={v => {
            setSettings(prev => ({ ...prev, podcastEpisodeSchedule: v }));
            patch({ podcastEpisodeSchedule: v });
          }}
        />
      </Row>

      </Panel>

      {/* ── Logging ──────────────────────────────────────────────────────── */}
      <Panel label="日志">

      <Row label="日志级别" hint="控制服务器日志文件的详细程度。">
        <Dropdown
          value={s.logLevel ?? 1}
          options={logLevelOptions}
          onChange={v => {
            setSettings(prev => ({ ...prev, logLevel: v }));
            patch({ logLevel: v });
          }}
        />
      </Row>

      <Row label="日志保留天数" hint="服务器日志在磁盘上保留的天数。">
        <NumInput
          value={s.loggerDailyLogsToKeep ?? 7}
          min={1}
          max={90}
          suffix="天"
          onChange={v => {
            setSettings(prev => ({ ...prev, loggerDailyLogsToKeep: v }));
            patch({ loggerDailyLogsToKeep: v });
          }}
        />
      </Row>

      <Row label="扫描日志保留数">
        <NumInput
          value={s.loggerScannerLogsToKeep ?? 2}
          min={1}
          max={30}
          onChange={v => {
            setSettings(prev => ({ ...prev, loggerScannerLogsToKeep: v }));
            patch({ loggerScannerLogsToKeep: v });
          }}
        />
      </Row>
      </Panel>
    </div>
  );
}
