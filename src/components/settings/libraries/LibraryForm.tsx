// Library create/edit form (name, media type, icon, provider, folders, and the
// per-library settings block).
// Moved verbatim out of LibrariesSection.tsx (God-File Decomposition roadmap, L3/L7).
import { useState, type ReactNode } from 'react';
import { MONO } from '../shared';
import {
  LIBRARY_ICONS,
  LIBRARY_PROVIDERS_BOOK,
  LIBRARY_PROVIDERS_PODCAST,
} from '../../../api/abs';
import type { CustomMetadataProvider } from '../../../api/abs';
import { iconEmoji, type FormState } from './formModel';
import { SmallBtn, Field, OnOff, SelectInput } from './widgets';
import ServerFolderPicker from './ServerFolderPicker';

export interface LibraryFormProps {
  initial: FormState;
  lockMediaType?: boolean;
  onSubmit: (form: FormState) => Promise<void>;
  onCancel: () => void;
  submitLabel: string;
  serverUrl: string;
  customProviders: CustomMetadataProvider[];
}

export default function LibraryForm({ initial, lockMediaType = false, onSubmit, onCancel, submitLabel, serverUrl, customProviders }: LibraryFormProps) {
  const [form, setForm] = useState<FormState>(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  // Index of the folder row currently being browsed (null = picker closed).
  const [pickerFor, setPickerFor] = useState<number | null>(null);

  function setMediaType(mt: 'book' | 'podcast') {
    setForm(f => ({
      ...f,
      mediaType: mt,
      provider: mt === 'podcast' ? LIBRARY_PROVIDERS_PODCAST[0] : LIBRARY_PROVIDERS_BOOK[0],
    }));
  }

  function updateFolder(i: number, v: string) {
    setForm(f => { const folders = [...f.folders]; folders[i] = v; return { ...f, folders }; });
  }

  function addFolder() {
    setForm(f => ({ ...f, folders: [...f.folders, ''] }));
  }

  function removeFolder(i: number) {
    setForm(f => {
      const folders = f.folders.filter((_, idx) => idx !== i);
      return { ...f, folders: folders.length ? folders : [''] };
    });
  }

  function browseFolder(i: number) {
    setPickerFor(i);
  }

  async function handleSubmit() {
    if (!form.name.trim()) return setError('需要填写名称。');
    const validFolders = form.folders.filter(p => p.trim());
    if (!validFolders.length) return setError('至少需要一个文件夹路径。');
    setError('');
    setSaving(true);
    try {
      await onSubmit({ ...form, folders: validFolders });
    } catch (e) {
      setError(typeof e === 'string' ? e : (e as Error)?.message ?? '发生错误。');
      setSaving(false);
    }
  }

  const providers = [
    ...(form.mediaType === 'podcast' ? LIBRARY_PROVIDERS_PODCAST : LIBRARY_PROVIDERS_BOOK).map(v => ({ value: v, label: v })),
    // Append registered custom providers for this media type (slug = custom-{id}).
    ...customProviders.filter(p => p.mediaType === form.mediaType).map(p => ({ value: p.slug, label: `${p.name}（自定义）` })),
  ];

  // Icon slugs are stored verbatim; only their rendered labels are translated.
  const ICON_LABEL: Record<string, string> = {
    database: '数据库', book: '书籍', audiobook: '有声书', podcast: '播客', music: '音乐',
    comic: '漫画', manga: '日漫', paper: '图书', magazine: '杂志', pirate: '海盗',
    'crystal-ball': '水晶球', alien: '外星人', astronaut: '宇航员', cat: '猫', dog: '狗',
    heart: '爱心', star: '星星', moon: '月亮',
  };

  const iconOptions = LIBRARY_ICONS.map(v => ({ value: v, label: `${iconEmoji(v)}  ${ICON_LABEL[v] ?? v}` }));

  // Label + content row reused throughout the form.
  const fRow = (label: string, content: ReactNode) => (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 16, padding: '8px 0',
      borderBottom: '1px solid rgba(255,255,255,0.04)',
    }}>
      <div style={{
        width: 140, flexShrink: 0, fontFamily: MONO, fontSize: 10,
        color: 'var(--onyx-text-mute)', letterSpacing: '0.08em', textTransform: 'uppercase',
      }}>
        {label}
      </div>
      <div style={{ flex: 1 }}>{content}</div>
    </div>
  );

  return (
    <div style={{ padding: '18px 20px', background: 'rgba(0,0,0,0.18)' }}>

      {fRow('名称', (
        <Field value={form.name} onChange={v => setForm(f => ({ ...f, name: v }))} placeholder="书库名称" />
      ))}

      {!lockMediaType && fRow('媒体类型', (
        <div style={{ display: 'flex', gap: 6 }}>
          {(['book', 'podcast'] as const).map(mt => (
            <button
              key={mt}
              onClick={() => setMediaType(mt)}
              style={{
                padding: '5px 14px', borderRadius: 6,
                background: form.mediaType === mt ? 'var(--onyx-accent-dim)' : 'transparent',
                border: `1px solid ${form.mediaType === mt ? 'var(--onyx-accent-edge)' : 'rgba(255,255,255,0.08)'}`,
                color: form.mediaType === mt ? 'var(--onyx-accent)' : 'var(--onyx-text-mute)',
                fontFamily: MONO, fontSize: 10.5, letterSpacing: '0.06em',
                cursor: 'pointer', fontWeight: form.mediaType === mt ? 600 : 400,
              }}
            >{mt === 'book' ? '有声书' : '播客'}</button>
          ))}
        </div>
      ))}

      {fRow('图标', (
        <SelectInput value={form.icon} onChange={v => setForm(f => ({ ...f, icon: v }))} options={iconOptions} />
      ))}

      {fRow('提供方', (
        <SelectInput value={form.provider} onChange={v => setForm(f => ({ ...f, provider: v }))} options={providers} />
      ))}

      {/* Folder list */}
      <div style={{ padding: '10px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 8 }}>
          <div style={{
            flex: 1, fontFamily: MONO, fontSize: 10, color: 'var(--onyx-text-mute)',
            letterSpacing: '0.08em', textTransform: 'uppercase',
          }}>
            文件夹
          </div>
          <button
            onClick={addFolder}
            style={{
              fontFamily: MONO, fontSize: 10, color: 'var(--onyx-accent)',
              background: 'transparent', border: 'none', cursor: 'pointer', letterSpacing: '0.06em',
            }}
          >
            + 添加文件夹
          </button>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {form.folders.map((fp, i) => (
            <div key={i} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <Field value={fp} onChange={v => updateFolder(i, v)} placeholder="/path/to/folder" mono />
              <button
                onClick={() => browseFolder(i)}
                title="浏览服务器文件系统"
                style={{
                  flexShrink: 0, padding: '7px 10px',
                  background: 'rgba(255,255,255,0.05)',
                  border: '1px solid var(--onyx-glass-edge)',
                  borderRadius: 6, color: 'var(--onyx-text-dim)',
                  fontFamily: MONO, fontSize: 10.5, letterSpacing: '0.06em',
                  cursor: 'pointer', whiteSpace: 'nowrap',
                }}
              >
                浏览…
              </button>
              {form.folders.length > 1 && (
                <button
                  onClick={() => removeFolder(i)}
                  title="移除文件夹"
                  style={{
                    width: 28, height: 28, flexShrink: 0, background: 'transparent',
                    border: 'none', color: 'var(--onyx-text-mute)', cursor: 'pointer',
                    fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}
                >
                  ✕
                </button>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Settings sub-section */}
      <div style={{
        marginTop: 14, marginBottom: 4, fontFamily: MONO, fontSize: 9,
        color: 'var(--onyx-text-mute)', letterSpacing: '0.12em', textTransform: 'uppercase',
      }}>
        设置
      </div>

      {fRow('文件监视', (
        <OnOff on={form.watcherEnabled} onChange={v => setForm(f => ({ ...f, watcherEnabled: v }))} />
      ))}

      {form.mediaType === 'book' && fRow('仅有声书', (
        <OnOff on={form.audiobooksOnly} onChange={v => setForm(f => ({ ...f, audiobooksOnly: v }))} />
      ))}

      {form.mediaType === 'book' && fRow('隐藏单本系列', (
        <OnOff on={form.hideSingleBookSeries} onChange={v => setForm(f => ({ ...f, hideSingleBookSeries: v }))} />
      ))}

      {fRow('自动扫描计划', (
        <Field
          value={form.autoScanCron}
          onChange={v => setForm(f => ({ ...f, autoScanCron: v }))}
          placeholder="0 2 * * *  （留空以禁用）"
          mono
        />
      ))}

      {fRow('判定听完', (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <input
            value={form.markFinishedPercent}
            onChange={e => setForm(f => ({ ...f, markFinishedPercent: e.target.value }))}
            style={{
              width: 50, padding: '7px 8px', background: 'rgba(0,0,0,0.28)',
              border: '1px solid var(--onyx-glass-edge)', borderRadius: 6,
              color: 'var(--onyx-text)', fontSize: 12, fontFamily: MONO,
              outline: 'none', textAlign: 'center',
            }}
          />
          <span style={{ fontFamily: MONO, fontSize: 11, color: 'var(--onyx-text-dim)' }}>% 完成  或</span>
          <input
            value={form.markFinishedRemaining}
            onChange={e => setForm(f => ({ ...f, markFinishedRemaining: e.target.value }))}
            style={{
              width: 50, padding: '7px 8px', background: 'rgba(0,0,0,0.28)',
              border: '1px solid var(--onyx-glass-edge)', borderRadius: 6,
              color: 'var(--onyx-text)', fontSize: 12, fontFamily: MONO,
              outline: 'none', textAlign: 'center',
            }}
          />
          <span style={{ fontFamily: MONO, fontSize: 11, color: 'var(--onyx-text-dim)' }}>秒剩余</span>
        </div>
      ))}

      {error && (
        <div style={{ marginTop: 10, fontFamily: MONO, fontSize: 11, color: '#e8716a' }}>{error}</div>
      )}

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
        <SmallBtn muted onClick={onCancel}>取消</SmallBtn>
        <SmallBtn onClick={handleSubmit} disabled={saving}>
          {saving ? '保存中…' : submitLabel}
        </SmallBtn>
      </div>

      {pickerFor !== null && (
        <ServerFolderPicker
          serverUrl={serverUrl}
          initial={form.folders[pickerFor] ?? ''}
          onSelect={path => { updateFolder(pickerFor, path); setPickerFor(null); }}
          onCancel={() => setPickerFor(null)}
        />
      )}
    </div>
  );
}
