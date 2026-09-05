import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import ReactDOM from 'react-dom';
import { save } from '@tauri-apps/plugin-dialog';
import {
  deleteLibraryFile,
  downloadLibraryFile,
  fetchItemExpanded,
  getAudioFileProbe,
  updateItemTracks,
} from '../../api/abs';
import type { LibraryAudioFile, LibraryFile, LibraryItem } from '../../api/abs';
import type { OnyxState } from '../../state/onyx';
import { useModalFocus } from '../../hooks/useModalFocus';
import { errorMessage } from '../../lib/presentError';
import { log } from '../../lib/log';

const MONO = "'JetBrains Mono', ui-monospace, monospace";
const SERIF = '"Source Serif 4", "Iowan Old Style", Georgia, serif';

const buttonStyle = (active = false): CSSProperties => ({
  border: `1px solid ${active ? 'var(--onyx-accent-edge)' : 'var(--onyx-glass-edge)'}`,
  background: active ? 'var(--onyx-accent-dim)' : 'transparent',
  color: active ? 'var(--onyx-accent)' : 'var(--onyx-text-dim)',
  borderRadius: 7,
  padding: '6px 10px',
  fontFamily: MONO,
  fontSize: 9.5,
  letterSpacing: '0.07em',
  textTransform: 'uppercase',
  cursor: 'pointer',
});

function fmtSize(bytes?: number | null): string {
  if (!bytes) return '—';
  if (bytes >= 1_073_741_824) return `${(bytes / 1_073_741_824).toFixed(2)} GB`;
  if (bytes >= 1_048_576) return `${(bytes / 1_048_576).toFixed(2)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${bytes} B`;
}

function fmtDuration(seconds?: number | null): string {
  if (seconds == null || !Number.isFinite(seconds)) return '—';
  const whole = Math.max(0, Math.round(seconds));
  const h = Math.floor(whole / 3600);
  const m = Math.floor((whole % 3600) / 60);
  const s = whole % 60;
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`;
}

function fmtBitrate(bitRate?: number | null): string {
  if (!bitRate) return '—';
  return `${Math.round(bitRate / 1000)} kbps`;
}

function displayPath(file: { metadata: { filename: string; relPath?: string | null; path?: string | null } }, fullPath: boolean): string {
  return fullPath
    ? (file.metadata.path || file.metadata.relPath || file.metadata.filename)
    : (file.metadata.relPath || file.metadata.filename);
}

export interface FileTreeNode {
  name: string;
  path: string;
  files: LibraryFile[];
  children: FileTreeNode[];
}

interface MutableTreeNode {
  name: string;
  path: string;
  files: LibraryFile[];
  children: Map<string, MutableTreeNode>;
}

/** Convert ABS item-relative paths into a deterministic, client-only tree. */
export function buildFileTree(files: LibraryFile[]): FileTreeNode[] {
  const root: MutableTreeNode = { name: '', path: '', files: [], children: new Map() };
  for (const file of files) {
    const relative = (file.metadata.relPath || file.metadata.filename).replace(/\\/g, '/');
    const parts = relative.split('/').filter(Boolean);
    const folders = parts.slice(0, -1);
    let node = root;
    for (const folder of folders) {
      const path = node.path ? `${node.path}/${folder}` : folder;
      let next = node.children.get(folder);
      if (!next) {
        next = { name: folder, path, files: [], children: new Map() };
        node.children.set(folder, next);
      }
      node = next;
    }
    node.files.push(file);
  }
  const freeze = (node: MutableTreeNode): FileTreeNode => ({
    name: node.name,
    path: node.path,
    files: [...node.files].sort((a, b) => a.metadata.filename.localeCompare(b.metadata.filename, undefined, { numeric: true })),
    children: [...node.children.values()]
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }))
      .map(freeze),
  });
  return [...root.children.values()].sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true })).map(freeze)
    .concat(root.files.length ? [{ name: '', path: '', files: root.files, children: [] }] : []);
}

function orderedAudioFiles(files: LibraryAudioFile[]): LibraryAudioFile[] {
  return [...files].sort((a, b) => {
    if (a.exclude !== b.exclude) return a.exclude ? 1 : -1;
    if (!a.exclude && !b.exclude) return a.index - b.index;
    return a.metadata.filename.localeCompare(b.metadata.filename, undefined, { numeric: true });
  });
}

function TypeBadge({ value }: { value: string }) {
  return <span style={{ fontFamily: MONO, fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--onyx-accent)', border: '1px solid var(--onyx-accent-edge)', background: 'var(--onyx-accent-dim)', borderRadius: 5, padding: '2px 6px' }}>{value || '未知'}</span>;
}

interface ActionButtonsProps {
  audio?: LibraryAudioFile;
  file: LibraryFile | LibraryAudioFile;
  canDownload: boolean;
  canDelete: boolean;
  isAdmin: boolean;
  busy: boolean;
  onInfo: (audio: LibraryAudioFile) => void;
  onDownload: (file: LibraryFile | LibraryAudioFile) => void;
  onDelete: (file: LibraryFile | LibraryAudioFile) => void;
}

function ActionButtons({ audio, file, canDownload, canDelete, isAdmin, busy, onInfo, onDownload, onDelete }: ActionButtonsProps) {
  if (!audio && !canDownload && !canDelete) return null;
  return (
    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 5, whiteSpace: 'nowrap' }}>
      {audio && isAdmin && <button style={buttonStyle()} disabled={busy} onClick={() => onInfo(audio)}>信息</button>}
      {canDownload && <button style={buttonStyle()} disabled={busy} onClick={() => onDownload(file)}>下载</button>}
      {canDelete && <button style={{ ...buttonStyle(), color: '#e8716a', borderColor: 'rgba(232,113,106,0.35)' }} disabled={busy} onClick={() => onDelete(file)}>删除</button>}
    </div>
  );
}

interface AudioInspectorProps {
  itemId: string;
  serverUrl: string;
  audio: LibraryAudioFile;
  onClose: () => void;
  onToast: OnyxState['setToast'];
}

function AudioInspector({ itemId, serverUrl, audio, onClose, onToast }: AudioInspectorProps) {
  const [probe, setProbe] = useState<unknown>(null);
  const [probing, setProbing] = useState(false);
  const [probeError, setProbeError] = useState('');
  const dialogRef = useModalFocus<HTMLDivElement>(onClose);
  const meta = audio.metadata;
  const infoRow = (label: string, value: ReactNode) => (
    <div style={{ display: 'grid', gridTemplateColumns: '130px minmax(0,1fr)', gap: 12, padding: '7px 0', borderBottom: '1px solid var(--onyx-line)' }}>
      <span style={{ fontFamily: MONO, fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--onyx-text-mute)' }}>{label}</span>
      <span className="onyx-selectable" style={{ minWidth: 0, overflowWrap: 'anywhere', fontSize: 12, color: 'var(--onyx-text-dim)' }}>{value ?? '—'}</span>
    </div>
  );
  const runProbe = async () => {
    setProbing(true); setProbeError('');
    try {
      setProbe(await getAudioFileProbe(serverUrl, itemId, audio.ino));
    } catch (error) {
      log.warn('library', 'audio probe failed', { itemId, fileId: audio.ino, err: String(error) });
      setProbeError(errorMessage(error, { operation: 'refresh' }));
    } finally { setProbing(false); }
  };
  const copyProbe = async () => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(probe, null, 2));
      onToast({ message: '探测 JSON 已复制', type: 'success' });
    } catch { onToast({ message: '无法复制探测 JSON', type: 'error' }); }
  };
  return ReactDOM.createPortal(
    <div style={{ position: 'fixed', inset: 0, zIndex: 2200, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.7)' }} onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="audio-file-info-title" style={{ width: 720, maxWidth: '92vw', maxHeight: '82vh', overflow: 'hidden', display: 'flex', flexDirection: 'column', background: 'var(--onyx-panel2)', border: '1px solid var(--onyx-glass-edge)', borderRadius: 14, boxShadow: '0 28px 80px rgba(0,0,0,0.72)' }}>
        <div style={{ padding: '18px 22px', borderBottom: '1px solid var(--onyx-line)', display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ minWidth: 0 }}>
            <div id="audio-file-info-title" style={{ fontFamily: SERIF, fontSize: 18 }}>音频文件详情</div>
            <div style={{ fontFamily: MONO, fontSize: 10, color: 'var(--onyx-text-mute)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{meta.filename}</div>
          </div>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 7 }}>
            {probe ? <button style={buttonStyle()} onClick={() => setProbe(null)}>存储数据</button> : <button style={buttonStyle(true)} onClick={() => void runProbe()} disabled={probing}>{probing ? '探测中…' : '探测音频文件'}</button>}
            <button style={buttonStyle()} onClick={onClose}>关闭</button>
          </div>
        </div>
        <div style={{ overflow: 'auto', padding: '12px 22px 22px' }}>
          {probeError && <div role="alert" style={{ color: '#e8716a', fontSize: 12, padding: '8px 0' }}>{probeError}</div>}
          {probe ? (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <span style={{ fontFamily: MONO, fontSize: 9, color: 'var(--onyx-text-mute)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>服务器最新 FFprobe JSON</span>
                <button style={buttonStyle()} onClick={() => void copyProbe()}>复制 JSON</button>
              </div>
              <pre className="onyx-selectable" style={{ margin: 0, padding: 14, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', background: 'rgba(0,0,0,0.22)', border: '1px solid var(--onyx-line)', borderRadius: 8, fontFamily: MONO, fontSize: 10.5, lineHeight: 1.55, color: 'var(--onyx-text-dim)' }}>{JSON.stringify(probe, null, 2)}</pre>
            </div>
          ) : (
            <>
              {infoRow('路径', meta.path || meta.relPath || meta.filename)}
              {infoRow('大小', fmtSize(meta.size))}
              {infoRow('时长', fmtDuration(audio.duration))}
              {infoRow('格式', audio.format || meta.format)}
              {infoRow('编码', audio.codec)}
              {infoRow('比特率', fmtBitrate(audio.bitRate))}
              {infoRow('声道', audio.channels ? `${audio.channels}${audio.channelLayout ? ` (${audio.channelLayout})` : ''}` : '—')}
              {infoRow('时间基准', audio.timeBase)}
              {infoRow('语言', audio.language)}
              {infoRow('章节', audio.chapters?.length ?? 0)}
              {infoRow('内嵌封面', audio.embeddedCoverArt ? '是' : '否')}
              {infoRow('音轨 / 碟片', `${audio.trackNumFromMeta ?? audio.trackNumFromFilename ?? '—'} / ${audio.discNumFromMeta ?? audio.discNumFromFilename ?? '—'}`)}
              {infoRow('校验', audio.manuallyVerified ? '手动校验' : '扫描顺序')}
              {audio.error && infoRow('扫描错误', audio.error)}
              <div style={{ marginTop: 18, marginBottom: 6, fontFamily: MONO, fontSize: 9, color: 'var(--onyx-text-mute)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>内嵌元数据标签</div>
              {Object.keys(audio.metaTags ?? {}).length ? Object.entries(audio.metaTags ?? {}).map(([key, value]) => infoRow(key, typeof value === 'string' ? value : JSON.stringify(value))) : <div style={{ fontSize: 12, color: 'var(--onyx-text-mute)' }}>未记录到内嵌标签。</div>}
            </>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}

interface FileTreeProps {
  nodes: FileTreeNode[];
  audioByIno: Map<string, LibraryAudioFile>;
  fullPath: boolean;
  st: OnyxState;
  busyId: string | null;
  onInfo: (audio: LibraryAudioFile) => void;
  onDownload: (file: LibraryFile | LibraryAudioFile) => void;
  onDelete: (file: LibraryFile | LibraryAudioFile) => void;
}

function FileTree({ nodes, audioByIno, fullPath, st, busyId, onInfo, onDownload, onDelete }: FileTreeProps) {
  return <div role="tree" aria-label="条目的文件目录">{nodes.map((node, i) => <TreeBranch key={node.path || `root-${i}`} node={node} depth={0} audioByIno={audioByIno} fullPath={fullPath} st={st} busyId={busyId} onInfo={onInfo} onDownload={onDownload} onDelete={onDelete} />)}</div>;
}

type TreeBranchProps = Omit<FileTreeProps, 'nodes'> & { node: FileTreeNode; depth: number };

function TreeBranch({ node, depth, audioByIno, fullPath, st, busyId, onInfo, onDownload, onDelete }: TreeBranchProps) {
  const [open, setOpen] = useState(true);
  const hasFolder = !!node.name;
  return (
    <div role="treeitem" aria-expanded={hasFolder ? open : undefined}>
      {hasFolder && <button onClick={() => setOpen(v => !v)} style={{ width: '100%', padding: `8px 18px 8px ${18 + depth * 18}px`, border: 0, borderBottom: '1px solid var(--onyx-line)', background: 'rgba(255,255,255,0.025)', color: 'var(--onyx-text-dim)', textAlign: 'left', cursor: 'pointer', fontFamily: MONO, fontSize: 10.5 }}><span aria-hidden="true" style={{ display: 'inline-block', width: 18 }}>{open ? '▾' : '▸'}</span>▰ {node.name}</button>}
      {(!hasFolder || open) && <div role="group">
        {node.children.map(child => <TreeBranch key={child.path} node={child} depth={depth + 1} audioByIno={audioByIno} fullPath={fullPath} st={st} busyId={busyId} onInfo={onInfo} onDownload={onDownload} onDelete={onDelete} />)}
        {node.files.map(file => {
          const audio = audioByIno.get(file.ino);
          return <div key={file.ino} style={{ display: 'grid', gridTemplateColumns: 'minmax(220px,1fr) 90px 90px minmax(180px,auto)', gap: 10, alignItems: 'center', padding: `9px 18px 9px ${38 + depth * 18}px`, borderBottom: '1px solid var(--onyx-line)' }}>
            <span className="onyx-selectable" style={{ minWidth: 0, overflowWrap: 'anywhere', fontSize: 12, color: 'var(--onyx-text-dim)' }}>{displayPath(file, fullPath)}</span>
            <span style={{ fontFamily: MONO, fontSize: 10, color: 'var(--onyx-text-mute)' }}>{fmtSize(file.metadata.size)}</span>
            <TypeBadge value={file.fileType} />
            <ActionButtons audio={audio} file={file} canDownload={st.canDownload} canDelete={st.canDelete} isAdmin={st.isAdmin} busy={busyId === file.ino} onInfo={onInfo} onDownload={onDownload} onDelete={onDelete} />
          </div>;
        })}
      </div>}
    </div>
  );
}

export interface FileTrackInspectorModalProps {
  item: LibraryItem;
  st: OnyxState;
  onClose: () => void;
}

export default function FileTrackInspectorModal({ item, st, onClose }: FileTrackInspectorModalProps) {
  const [detail, setDetail] = useState<LibraryItem | null>(null);
  const [loadError, setLoadError] = useState('');
  const [tab, setTab] = useState<'tracks' | 'files'>('tracks');
  const [fileView, setFileView] = useState<'tree' | 'list'>('tree');
  const [fullPath, setFullPath] = useState(false);
  const [selectedAudio, setSelectedAudio] = useState<LibraryAudioFile | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [workingTracks, setWorkingTracks] = useState<LibraryAudioFile[]>([]);
  const [draggedIno, setDraggedIno] = useState<string | null>(null);
  const initialSignature = useRef('');

  const load = useCallback(async () => {
    setLoadError('');
    try {
      const next = await fetchItemExpanded(st.serverUrl, item.id);
      setDetail(next);
      const ordered = orderedAudioFiles(next.media.audioFiles ?? []);
      setWorkingTracks(ordered);
      initialSignature.current = JSON.stringify(ordered.map(file => [file.ino, file.exclude]));
      return next;
    } catch (error) {
      log.warn('library', 'file inspector load failed', { itemId: item.id, err: String(error) });
      setLoadError(errorMessage(error, { operation: 'refresh' }));
      return null;
    }
  }, [item.id, st.serverUrl]);

  useEffect(() => { void load(); }, [load]);
  const dirty = editing && JSON.stringify(workingTracks.map(file => [file.ino, file.exclude])) !== initialSignature.current;
  const requestClose = useCallback(() => {
    if (!dirty) { onClose(); return; }
    st.setConfirmDialog({ title: '放弃音轨更改？', message: '未保存的音轨顺序与包含设置更改将丢失。', confirmLabel: '放弃', onConfirm: onClose });
  }, [dirty, onClose, st]);
  const dialogRef = useModalFocus<HTMLDivElement>(requestClose);

  const files = detail?.libraryFiles ?? [];
  const audioFiles = detail?.media.audioFiles ?? [];
  const audioByIno = useMemo(() => new Map(audioFiles.map(audio => [audio.ino, audio])), [audioFiles]);
  const tree = useMemo(() => buildFileTree(files), [files]);
  const activeMutationBlocked = st.currentBookId === item.id && st.sessionReady;
  const refreshCapabilitiesOnForbidden = (error: unknown) => {
    if (/403|forbidden|permission/i.test(String(error))) {
      st.refreshPermissions().catch(refreshError =>
        log.warn('auth', 'permission refresh after denied file action failed', { err: String(refreshError) })
      );
    }
  };

  const onDownload = async (file: LibraryFile | LibraryAudioFile) => {
    const destination = await save({ defaultPath: file.metadata.filename, title: `保存 ${file.metadata.filename}` });
    if (!destination) return;
    setBusyId(file.ino);
    try {
      await downloadLibraryFile(st.serverUrl, item.id, file.ino, destination);
      st.setToast({ message: `已下载“${file.metadata.filename}”`, type: 'success' });
    } catch (error) {
      refreshCapabilitiesOnForbidden(error);
      log.warn('downloads', 'individual file download failed', { itemId: item.id, fileId: file.ino, err: String(error) });
      st.setToast({ message: errorMessage(error, { operation: 'download' }), type: 'error' });
    } finally { setBusyId(null); }
  };

  const onDelete = (file: LibraryFile | LibraryAudioFile) => {
    if (activeMutationBlocked) {
      st.setToast({ message: '请先停止本书正在进行的播放会话，再删除文件。', type: 'info' });
      return;
    }
    const isTrack = audioByIno.has(file.ino);
    st.setConfirmDialog({
      title: '删除服务器文件？',
      message: `要从 Audiobookshelf 服务器存储中永久删除“${file.metadata.filename}”吗？${isTrack ? ' 该文件属于该书播放音轨列表的一部分。' : ''}此操作无法撤销。`,
      confirmLabel: '删除文件',
      onConfirm: () => {
        setBusyId(file.ino);
        deleteLibraryFile(st.serverUrl, item.id, file.ino)
          .then(async () => {
            setSelectedAudio(null);
            const refreshed = await load();
            if (refreshed) st.updateLibraryItem(refreshed);
            st.setToast({ message: `已删除“${file.metadata.filename}”`, type: 'success' });
          })
          .catch(error => {
            refreshCapabilitiesOnForbidden(error);
            log.warn('library', 'individual file delete failed', { itemId: item.id, fileId: file.ino, err: String(error) });
            st.setToast({ message: errorMessage(error, { operation: 'delete' }), type: 'error' });
            if (String(error).includes('404')) void load();
          })
          .finally(() => setBusyId(null));
      },
    });
  };

  const moveTrack = (ino: string, delta: number) => {
    setWorkingTracks(current => {
      const index = current.findIndex(file => file.ino === ino);
      const target = index + delta;
      if (index < 0 || target < 0 || target >= current.length) return current;
      const next = [...current];
      const [moved] = next.splice(index, 1);
      next.splice(target, 0, moved);
      return next;
    });
  };
  const dropTrack = (targetIno: string) => {
    if (!draggedIno || draggedIno === targetIno) return;
    setWorkingTracks(current => {
      const from = current.findIndex(file => file.ino === draggedIno);
      const to = current.findIndex(file => file.ino === targetIno);
      if (from < 0 || to < 0) return current;
      const next = [...current];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });
    setDraggedIno(null);
  };
  const saveTracks = async () => {
    if (activeMutationBlocked) {
      st.setToast({ message: '请先停止本书正在进行的播放会话，再更改其音轨。', type: 'info' });
      return;
    }
    if (!workingTracks.some(file => !file.exclude)) {
      st.setToast({ message: '至少保留一个已包含的音频音轨。', type: 'error' });
      return;
    }
    setBusyId('tracks');
    try {
      const updated = await updateItemTracks(st.serverUrl, item.id, workingTracks.map(file => ({ ino: file.ino, exclude: file.exclude })));
      setDetail(updated);
      st.updateLibraryItem(updated);
      const ordered = orderedAudioFiles(updated.media.audioFiles ?? []);
      setWorkingTracks(ordered);
      initialSignature.current = JSON.stringify(ordered.map(file => [file.ino, file.exclude]));
      setEditing(false);
      st.setToast({ message: '音轨顺序已更新', type: 'success' });
    } catch (error) {
      refreshCapabilitiesOnForbidden(error);
      log.warn('playback', 'track update failed', { itemId: item.id, err: String(error) });
      st.setToast({ message: errorMessage(error, { operation: 'save' }), type: 'error' });
    } finally { setBusyId(null); }
  };

  const renderFileRow = (file: LibraryFile, index: number) => {
    const audio = audioByIno.get(file.ino);
    return <tr key={file.ino} style={{ borderBottom: index < files.length - 1 ? '1px solid var(--onyx-line)' : 'none' }}>
      <td className="onyx-selectable" style={{ padding: '10px 14px', minWidth: 260, overflowWrap: 'anywhere', color: 'var(--onyx-text-dim)', fontSize: 12 }}>{displayPath(file, fullPath)}</td>
      <td style={{ padding: '10px 14px', fontFamily: MONO, fontSize: 10, color: 'var(--onyx-text-mute)', whiteSpace: 'nowrap' }}>{fmtSize(file.metadata.size)}</td>
      <td style={{ padding: '10px 14px' }}><TypeBadge value={file.fileType} /></td>
      <td style={{ padding: '7px 14px' }}><ActionButtons audio={audio} file={file} canDownload={st.canDownload} canDelete={st.canDelete} isAdmin={st.isAdmin} busy={busyId === file.ino} onInfo={setSelectedAudio} onDownload={onDownload} onDelete={onDelete} /></td>
    </tr>;
  };

  const modal = (
    <div style={{ position: 'fixed', inset: 0, zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.66)' }} onMouseDown={event => { if (event.target === event.currentTarget) requestClose(); }}>
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="file-track-inspector-title" style={{ width: 1040, maxWidth: '94vw', height: 'min(760px,88vh)', display: 'flex', flexDirection: 'column', overflow: 'hidden', background: 'var(--onyx-panel2)', border: '1px solid var(--onyx-glass-edge)', borderRadius: 16, boxShadow: '0 32px 90px rgba(0,0,0,0.75)' }}>
        <div style={{ padding: '18px 22px 14px', borderBottom: '1px solid var(--onyx-line)', display: 'flex', gap: 12, alignItems: 'center' }}>
          <div style={{ minWidth: 0 }}>
            <div id="file-track-inspector-title" style={{ fontFamily: SERIF, fontSize: 20, color: 'var(--onyx-text)' }}>文件与音轨</div>
            <div style={{ fontFamily: MONO, fontSize: 10, color: 'var(--onyx-text-mute)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{detail?.media.metadata.title || item.media.metadata.title || item.id}</div>
          </div>
          {detail?.isMissing && <span role="status" style={{ color: '#e8716a', fontFamily: MONO, fontSize: 10 }}>媒体缺失</span>}
          <button style={{ ...buttonStyle(), marginLeft: 'auto' }} onClick={requestClose}>关闭</button>
        </div>

        <div role="tablist" aria-label="文件检查视图" style={{ display: 'flex', gap: 8, padding: '12px 22px 0' }}>
          <button role="tab" aria-selected={tab === 'tracks'} style={buttonStyle(tab === 'tracks')} onClick={() => setTab('tracks')}>音轨 · {audioFiles.length}</button>
          <button role="tab" aria-selected={tab === 'files'} style={buttonStyle(tab === 'files')} onClick={() => setTab('files')}>书库文件 · {files.length}</button>
        </div>

        <div style={{ minHeight: 48, display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 7, padding: '10px 22px', borderBottom: '1px solid var(--onyx-line)' }}>
          {st.isAdmin && <button style={buttonStyle(fullPath)} onClick={() => setFullPath(value => !value)}>{fullPath ? '相对路径' : '完整路径'}</button>}
          {tab === 'files' && <><button style={buttonStyle(fileView === 'tree')} onClick={() => setFileView('tree')}>树状</button><button style={buttonStyle(fileView === 'list')} onClick={() => setFileView('list')}>列表</button></>}
          {tab === 'tracks' && !editing && st.canUpdate && audioFiles.length > 1 && <button style={{ ...buttonStyle(true), marginLeft: 'auto' }} onClick={() => { setWorkingTracks(orderedAudioFiles(audioFiles)); setEditing(true); }}>管理音轨</button>}
          {tab === 'tracks' && editing && <>
            <button style={buttonStyle()} onClick={() => setWorkingTracks(current => [...current].sort((a, b) => (a.trackNumFromFilename ?? Number.MAX_SAFE_INTEGER) - (b.trackNumFromFilename ?? Number.MAX_SAFE_INTEGER)))}>文件名音轨号</button>
            <button style={buttonStyle()} onClick={() => setWorkingTracks(current => [...current].sort((a, b) => (a.trackNumFromMeta ?? Number.MAX_SAFE_INTEGER) - (b.trackNumFromMeta ?? Number.MAX_SAFE_INTEGER)))}>元数据音轨号</button>
            <button style={buttonStyle()} onClick={() => setWorkingTracks(current => [...current].sort((a, b) => a.metadata.filename.localeCompare(b.metadata.filename, undefined, { numeric: true })))}>文件名</button>
            <span style={{ marginLeft: 'auto', display: 'flex', gap: 7 }}><button style={buttonStyle()} onClick={() => { setWorkingTracks(orderedAudioFiles(audioFiles)); setEditing(false); }}>取消</button><button style={buttonStyle(true)} disabled={busyId === 'tracks'} onClick={() => void saveTracks()}>{busyId === 'tracks' ? '保存中…' : '保存音轨顺序'}</button></span>
          </>}
        </div>

        <div style={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
          {!detail && !loadError && <div style={{ padding: 26, fontFamily: MONO, fontSize: 11, color: 'var(--onyx-text-mute)' }}>正在加载条目文件…</div>}
          {loadError && <div role="alert" style={{ padding: 26, color: '#e8716a', fontSize: 12 }}>{loadError}<div><button style={{ ...buttonStyle(), marginTop: 12 }} onClick={() => void load()}>重试</button></div></div>}
          {detail && tab === 'tracks' && (editing ? (
            <div style={{ minWidth: 900 }}>
              {workingTracks.map((audio, index) => <div key={audio.ino} draggable onDragStart={() => setDraggedIno(audio.ino)} onDragOver={event => event.preventDefault()} onDrop={() => dropTrack(audio.ino)} style={{ display: 'grid', gridTemplateColumns: '42px 66px minmax(260px,1fr) 90px 90px 90px 120px', alignItems: 'center', gap: 8, padding: '8px 14px', borderBottom: '1px solid var(--onyx-line)', opacity: audio.exclude ? 0.48 : 1, cursor: 'grab' }}>
                <span aria-hidden="true" style={{ fontFamily: MONO, color: 'var(--onyx-text-mute)' }}>⋮⋮</span>
                <span style={{ fontFamily: MONO, fontSize: 10 }}>{audio.exclude ? '—' : workingTracks.slice(0, index).filter(file => !file.exclude).length + 1}</span>
                <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 12 }}>{audio.metadata.filename}</span>
                <span style={{ fontFamily: MONO, fontSize: 10 }}>文件 {audio.trackNumFromFilename ?? '—'}</span>
                <span style={{ fontFamily: MONO, fontSize: 10 }}>元数据 {audio.trackNumFromMeta ?? '—'}</span>
                <span style={{ fontFamily: MONO, fontSize: 10 }}>{fmtDuration(audio.duration)}</span>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontFamily: MONO, fontSize: 9.5 }}><input type="checkbox" checked={!audio.exclude} onChange={event => setWorkingTracks(current => current.map(file => file.ino === audio.ino ? { ...file, exclude: !event.target.checked } : file))} /> 包含</label>
                <span style={{ display: 'flex', gap: 3 }}><button aria-label={`上移 ${audio.metadata.filename}`} style={buttonStyle()} disabled={index === 0} onClick={() => moveTrack(audio.ino, -1)}>↑</button><button aria-label={`下移 ${audio.metadata.filename}`} style={buttonStyle()} disabled={index === workingTracks.length - 1} onClick={() => moveTrack(audio.ino, 1)}>↓</button></span>
              </div>)}
            </div>
          ) : audioFiles.length ? (
            <table style={{ width: '100%', minWidth: 840, borderCollapse: 'collapse' }}><thead><tr>{['#', '文件名', '编码', '比特率', '大小', '时长', '状态', '操作'].map(label => <th key={label} style={{ padding: '8px 12px', textAlign: 'left', fontFamily: MONO, fontSize: 8.5, fontWeight: 400, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--onyx-text-mute)', borderBottom: '1px solid var(--onyx-line)' }}>{label}</th>)}</tr></thead><tbody>{orderedAudioFiles(audioFiles).map(audio => <tr key={audio.ino} style={{ borderBottom: '1px solid var(--onyx-line)', opacity: audio.exclude ? 0.5 : 1 }}>
              <td style={{ padding: '10px 12px', fontFamily: MONO, fontSize: 10 }}>{audio.exclude ? '—' : audio.index}</td>
              <td className="onyx-selectable" style={{ padding: '10px 12px', minWidth: 250, overflowWrap: 'anywhere', fontSize: 12 }}>{displayPath(audio, fullPath)}</td>
              <td style={{ padding: '10px 12px', fontFamily: MONO, fontSize: 10 }}>{audio.codec || '—'}</td>
              <td style={{ padding: '10px 12px', fontFamily: MONO, fontSize: 10 }}>{fmtBitrate(audio.bitRate)}</td>
              <td style={{ padding: '10px 12px', fontFamily: MONO, fontSize: 10 }}>{fmtSize(audio.metadata.size)}</td>
              <td style={{ padding: '10px 12px', fontFamily: MONO, fontSize: 10 }}>{fmtDuration(audio.duration)}</td>
              <td style={{ padding: '10px 12px', fontFamily: MONO, fontSize: 9, color: audio.error ? '#e8716a' : 'var(--onyx-text-mute)' }}>{audio.error ? '错误' : audio.exclude ? '已排除' : '已包含'}</td>
              <td style={{ padding: '7px 12px' }}><ActionButtons audio={audio} file={audio} canDownload={st.canDownload} canDelete={st.canDelete} isAdmin={st.isAdmin} busy={busyId === audio.ino} onInfo={setSelectedAudio} onDownload={onDownload} onDelete={onDelete} /></td>
            </tr>)}</tbody></table>
          ) : <div style={{ padding: 26, color: 'var(--onyx-text-mute)', fontFamily: MONO, fontSize: 11 }}>未找到音频文件。</div>)}
          {detail && tab === 'files' && (files.length ? (fileView === 'tree' ? <FileTree nodes={tree} audioByIno={audioByIno} fullPath={fullPath} st={st} busyId={busyId} onInfo={setSelectedAudio} onDownload={onDownload} onDelete={onDelete} /> : <table style={{ width: '100%', minWidth: 760, borderCollapse: 'collapse' }}><thead><tr>{['路径', '大小', '类型', '操作'].map(label => <th key={label} style={{ padding: '8px 14px', textAlign: 'left', fontFamily: MONO, fontSize: 8.5, fontWeight: 400, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--onyx-text-mute)', borderBottom: '1px solid var(--onyx-line)' }}>{label}</th>)}</tr></thead><tbody>{files.map(renderFileRow)}</tbody></table>) : <div style={{ padding: 26, color: 'var(--onyx-text-mute)', fontFamily: MONO, fontSize: 11 }}>未找到书库文件。</div>)}
        </div>
        {activeMutationBlocked && <div role="status" style={{ padding: '9px 22px', borderTop: '1px solid var(--onyx-line)', fontFamily: MONO, fontSize: 9.5, color: '#d8a84e' }}>请先停止当前播放会话，再删除文件或保存音轨更改。</div>}
      </div>
      {selectedAudio && <AudioInspector itemId={item.id} serverUrl={st.serverUrl} audio={selectedAudio} onClose={() => setSelectedAudio(null)} onToast={st.setToast} />}
    </div>
  );
  return ReactDOM.createPortal(modal, document.body);
}
