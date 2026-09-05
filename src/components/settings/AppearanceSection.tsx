import { useRef, useEffect, useState, type CSSProperties } from 'react';
import type { OnyxState } from '../../state/onyx';
import { SectionHead, Row, Toggle, Panel, Seg, SegGroup, eyebrowStyle } from './shared';
import { COVER_SIZES } from '../shelf/LibraryShelf';

export interface AppearanceSectionProps { st: OnyxState; }

const SCALE_OPTIONS: number[] = [90, 100, 110, 125];
const SORTS = [
  { id: 'recently',      label: '最近添加' },
  { id: 'title',         label: '书名'          },
  { id: 'author',        label: '作者'         },
  { id: 'most-listened', label: '收听最多'  },
];
const SIZES = ['S', 'M', 'L', 'XL', 'XXL', 'XXXL'];

// Accent swatches — the selectable accent colours (six, matching the reference).
const SWATCHES = ['#d4a64a', '#c96442', '#7aa86a', '#5a8fc4', '#a86a8e', '#9b7fd0'];

// Below this content width the two panels stack vertically (and the surrounding
// settings pane scrolls). Above it they sit side by side as in the reference.
const STACK_BREAKPOINT = 840;

// "Shelf tabs" sub-header inside the Shelf panel — eyebrow styling, block layout.
const subEyebrow: CSSProperties = { ...eyebrowStyle, padding: '16px 0 8px' };

export default function AppearanceSection({ st }: AppearanceSectionProps) {
  const currentHex = (st.accentColor || '').toLowerCase();

  // Responsive layout: observe the section's own width (not the window) so the
  // breakpoint reacts to the settings pane, which is narrower than the viewport.
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [stacked, setStacked] = useState(false);
  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const ro = new ResizeObserver(entries => {
      setStacked(entries[0].contentRect.width < STACK_BREAKPOINT);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // ── Theme panel ────────────────────────────────────────────────────────────
  const themePanel = (
    <Panel label="主题" style={{ marginTop: 0, width: stacked ? '100%' : 380, flexShrink: 0 }}>
        <Row label="主题">
          <SegGroup>
            {[
              { id: 'dark',   label: 'Onyx' },
              { id: 'light',  label: 'Folio' },
              { id: 'system', label: '跟随系统' },
            ].map(t => (
              <Seg key={t.id} active={st.theme === t.id} onClick={() => st.setTheme(t.id)}>{t.label}</Seg>
            ))}
          </SegGroup>
        </Row>

        <Row label="强调色" hint="用于活动控件与进度指示。">
          <div style={{ display: 'flex', gap: 10 }}>
            {SWATCHES.map(c => {
              const active = c.toLowerCase() === currentHex;
              return (
                <button
                  key={c}
                  onClick={() => st.setAccentColor(c)}
                  title={c}
                  aria-label={`将强调色设为 ${c}`}
                  style={{
                    width: 26, height: 26, borderRadius: 13, background: c, cursor: 'pointer',
                    border: active ? '2px solid #ebe7df' : '1px solid rgba(0,0,0,0.4)',
                    boxShadow: active ? `0 0 14px ${c}88` : 'none',
                    padding: 0, transition: 'transform 0.12s, box-shadow 0.15s',
                    transform: active ? 'scale(1.08)' : 'scale(1)',
                  }}
                />
              );
            })}
            <input
              type="color"
              value={/^#[0-9a-f]{6}$/i.test(currentHex) ? currentHex : SWATCHES[0]}
              onChange={e => st.setAccentColor(e.target.value)}
              aria-label="选择自定义强调色"
              title="自定义强调色"
              style={{ width: 28, height: 28, padding: 0, border: '1px solid var(--onyx-glass-edge)', borderRadius: 14, background: 'transparent', cursor: 'pointer' }}
            />
          </div>
        </Row>

        <Row label="界面缩放" hint="缩放整个应用。在 4K 显示器上很有用。">
          <SegGroup>
            {SCALE_OPTIONS.map(v => (
              <Seg key={v} active={v === st.scale} onClick={() => st.setScale(v)}>{v}%</Seg>
            ))}
          </SegGroup>
        </Row>

        <Row label="半透明表面" hint="卡片上的玻璃效果。在较旧的硬件上可关闭以提升性能。">
          <Toggle on={st.translucent} onChange={st.setTranslucent} />
        </Row>
    </Panel>
  );

  // ── Shelf panel ────────────────────────────────────────────────────────────
  const shelfPanel = (
    <Panel label="书架" style={{ marginTop: 0, width: stacked ? '100%' : 'auto', flex: stacked ? '0 0 auto' : 1, minWidth: 0 }}>
        <Row label="默认排序">
          <SegGroup>
            {SORTS.map(s => (
              <Seg key={s.id} active={s.id === st.librarySort} onClick={() => st.setLibrarySort(s.id)}>{s.label}</Seg>
            ))}
          </SegGroup>
        </Row>

        <Row label="封面大小">
          <SegGroup>
            {SIZES.map(v => (
              <Seg key={v} active={v === st.coverSize} onClick={() => st.setCoverSize(v)}>{v} · {COVER_SIZES[v]} px</Seg>
            ))}
          </SegGroup>
        </Row>

        <Row label="浏览磁贴样式" hint="系列、作者、类型等书架标签如何呈现每个分组。">
          <SegGroup>
            {[
              { id: 'stack',  label: '堆叠' },
              { id: 'mosaic', label: '拼贴' },
            ].map(t => (
              <Seg key={t.id} active={st.browseTileStyle === t.id} onClick={() => st.setBrowseTileStyle(t.id as 'stack' | 'mosaic')}>{t.label}</Seg>
            ))}
          </SegGroup>
        </Row>

        <Row label="按系列分组" hint="将系列各卷堆叠在同一封面下。">
          <Toggle on={st.groupBySeries} onChange={st.setGroupBySeries} />
        </Row>

        <Row label="显示已听完的书目" hint="在主网格中纳入已 100% 听完的图书。">
          <Toggle on={st.showFinished} onChange={st.setShowFinished} />
        </Row>

        <Row label="显示进度叠条" hint="封面缩略图底部的细金色进度条。">
          <Toggle on={st.showProgressOverlay} onChange={st.setShowProgressOverlay} />
        </Row>

        {/* Only meaningful when there are two stats sources to combine: an ABS
            login AND at least one local library (Local Listening Stats roadmap). */}
        {!!st.serverUrl && st.libraries.some(l => l.source === 'local') && (
          <Row
            label="合并收听统计"
            hint="将服务器与本机的收听记录合并为一个“你的统计”视图。关闭后：统计卡片跟随当前书库。"
          >
            <Toggle on={st.combineStats} onChange={st.setCombineStats} />
          </Row>
        )}

        {/* Optional shelf tabs (Home/Series/Authors/Collections are always shown) */}
        <div style={subEyebrow}>书架标签</div>

        <Row label="讲述人标签" hint="在书架中显示“讲述人”标签。">
          <Toggle on={!!st.optionalTabs.narrators} onChange={v => st.setOptionalTab('narrators', v)} />
        </Row>
        <Row label="类型标签" hint="在书架中显示“类型”标签。">
          <Toggle on={!!st.optionalTabs.genres} onChange={v => st.setOptionalTab('genres', v)} />
        </Row>
        <Row label="出版社标签" hint="在书架中显示“出版社”标签。">
          <Toggle on={!!st.optionalTabs.publishers} onChange={v => st.setOptionalTab('publishers', v)} />
        </Row>
        <Row label="播放列表标签" hint="在书架中显示“播放列表”标签。">
          <Toggle on={!!st.optionalTabs.playlists} onChange={v => st.setOptionalTab('playlists', v)} />
        </Row>
    </Panel>
  );

  return (
    <div ref={rootRef}>
      <SectionHead title="外观" subtitle="Skald 的观感——主题，以及书架的呈现方式。" />

      {/* Two glass panels: side by side at high resolution, stacked (with the
          settings pane scrolling) at low resolution. */}
      <div style={{ display: 'flex', flexDirection: stacked ? 'column' : 'row', gap: 24, alignItems: 'flex-start', maxWidth: 1080 }}>
        {themePanel}
        {shelfPanel}
      </div>
    </div>
  );
}
