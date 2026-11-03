import { useRef, useEffect, useState, type CSSProperties } from 'react';
import type { OnyxState } from '../../state/onyx';
import { SectionHead, Row, Toggle, Panel, Seg, SegGroup, eyebrowStyle } from './shared';
import { COVER_SIZES } from '../shelf/LibraryShelf';
import { ACCENT_PRESETS, THEME_PRESETS } from '../../state/theme';
import { useSidebarCompact, setSidebarCompact, useReduceMotion, setReduceMotion } from '../../lib/uiPrefs';
import { useI18n } from '../../i18n';

export interface AppearanceSectionProps { st: OnyxState; }

const SCALE_OPTIONS: number[] = [90, 100, 110, 125];
const SORTS = [
  { id: 'recently',      labelKey: 'appearance.sort.recently'   },
  { id: 'title',         labelKey: 'appearance.sort.title'      },
  { id: 'author',        labelKey: 'appearance.sort.author'     },
  { id: 'most-listened', labelKey: 'appearance.sort.mostListened' },
] as const;
const SIZES = ['S', 'M', 'L', 'XL', 'XXL', 'XXXL'];

// Accent swatches — the macOS system colour set plus Skald gold, defined once in
// state/theme.ts so any other accent-aware surface reads the same list.
const SWATCHES = ACCENT_PRESETS.map(preset => preset.hex);

// Below this content width the two panels stack vertically (and the surrounding
// settings pane scrolls). Above it they sit side by side as in the reference.
const STACK_BREAKPOINT = 840;

// "Shelf tabs" sub-header inside the Shelf panel — eyebrow styling, block layout.
const subEyebrow: CSSProperties = { ...eyebrowStyle, padding: '16px 0 8px' };

export default function AppearanceSection({ st }: AppearanceSectionProps) {
  const { t } = useI18n();
  const currentHex = (st.accentColor || '').toLowerCase();
  const sidebarCompact = useSidebarCompact();
  const reduceMotion = useReduceMotion();

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
    <Panel label={t('appearance.panelTheme')} style={{ marginTop: 0, width: stacked ? '100%' : 380, flexShrink: 0 }}>
        <Row label={t('appearance.themeRow')}>
          <SegGroup>
            {[
              ...THEME_PRESETS.map(preset => ({ id: preset.id, label: preset.label })),
              { id: 'system', label: t('appearance.theme.system') },
            ].map(option => (
              <Seg key={option.id} active={st.theme === option.id} onClick={() => st.setTheme(option.id)}>{option.label}</Seg>
            ))}
          </SegGroup>
        </Row>

        <Row label={t('appearance.accent')} hint={t('appearance.accentHint')}>
          <div style={{ display: 'flex', gap: 10 }}>
            {SWATCHES.map(c => {
              const active = c.toLowerCase() === currentHex;
              return (
                <button
                  key={c}
                  onClick={() => st.setAccentColor(c)}
                  title={c}
                  aria-label={`Set accent color ${c}`}
                  style={{
                    width: 26, height: 26, borderRadius: 13, background: c, cursor: 'pointer',
                    // Always 2px: switching border widths resized the swatch and
                    // nudged every neighbour by 1px on selection.
                    border: active ? '2px solid var(--onyx-text)' : '2px solid transparent',
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
              aria-label="Choose custom accent color"
              title="Custom accent color"
              style={{ width: 28, height: 28, padding: 0, border: '1px solid var(--onyx-glass-edge)', borderRadius: 14, background: 'transparent', cursor: 'pointer' }}
            />
          </div>
        </Row>

        <Row label={t('appearance.scale')} hint={t('appearance.scaleHint')}>
          <SegGroup>
            {SCALE_OPTIONS.map(v => (
              <Seg key={v} active={v === st.scale} onClick={() => st.setScale(v)}>{v}%</Seg>
            ))}
          </SegGroup>
        </Row>

        <Row label={t('appearance.translucent')} hint={t('appearance.translucentHint')}>
          <Toggle on={st.translucent} onChange={st.setTranslucent} />
        </Row>

        <Row label={t('appearance.sidebarCompact')} hint={t('appearance.sidebarCompactHint')}>
          <Toggle on={sidebarCompact} onChange={setSidebarCompact} />
        </Row>

        <Row label={t('appearance.reduceMotion')} hint={t('appearance.reduceMotionHint')}>
          <Toggle on={reduceMotion} onChange={setReduceMotion} />
        </Row>
    </Panel>
  );

  // ── Shelf panel ────────────────────────────────────────────────────────────
  const shelfPanel = (
    <Panel label={t('appearance.panelShelf')} style={{ marginTop: 0, width: stacked ? '100%' : 'auto', flex: stacked ? '0 0 auto' : 1, minWidth: 0 }}>
        <Row label={t('appearance.defaultSort')}>
          <SegGroup>
            {SORTS.map(s => (
              <Seg key={s.id} active={s.id === st.librarySort} onClick={() => st.setLibrarySort(s.id)}>{t(s.labelKey)}</Seg>
            ))}
          </SegGroup>
        </Row>

        <Row label={t('appearance.coverSize')}>
          <SegGroup>
            {SIZES.map(v => (
              <Seg key={v} active={v === st.coverSize} onClick={() => st.setCoverSize(v)}>{v} · {COVER_SIZES[v]} px</Seg>
            ))}
          </SegGroup>
        </Row>

        <Row label={t('appearance.tileStyle')} hint={t('appearance.tileStyleHint')}>
          <SegGroup>
            {[
              { id: 'stack',  label: t('appearance.tile.stack') },
              { id: 'mosaic', label: t('appearance.tile.mosaic') },
            ].map(t => (
              <Seg key={t.id} active={st.browseTileStyle === t.id} onClick={() => st.setBrowseTileStyle(t.id as 'stack' | 'mosaic')}>{t.label}</Seg>
            ))}
          </SegGroup>
        </Row>

        <Row label={t('appearance.groupBySeries')} hint={t('appearance.groupBySeriesHint')}>
          <Toggle on={st.groupBySeries} onChange={st.setGroupBySeries} />
        </Row>

        <Row label={t('appearance.showFinished')} hint={t('appearance.showFinishedHint')}>
          <Toggle on={st.showFinished} onChange={st.setShowFinished} />
        </Row>

        <Row label={t('appearance.progressOverlay')} hint={t('appearance.progressOverlayHint')}>
          <Toggle on={st.showProgressOverlay} onChange={st.setShowProgressOverlay} />
        </Row>

        {/* Only meaningful when there are two stats sources to combine: an ABS
            login AND at least one local library (Local Listening Stats roadmap). */}
        {!!st.serverUrl && st.libraries.some(l => l.source === 'local') && (
          <Row
            label={t('appearance.combineStats')}
            hint={t('appearance.combineStatsHint')}
          >
            <Toggle on={st.combineStats} onChange={st.setCombineStats} />
          </Row>
        )}

        {/* Optional shelf tabs (Home/Series/Authors/Collections are always shown) */}
        <div style={subEyebrow}>{t('appearance.shelfTabs')}</div>

        <Row label={t('appearance.tab.narrators')} hint={t('appearance.tab.narratorsHint')}>
          <Toggle on={!!st.optionalTabs.narrators} onChange={v => st.setOptionalTab('narrators', v)} />
        </Row>
        <Row label={t('appearance.tab.genres')} hint={t('appearance.tab.genresHint')}>
          <Toggle on={!!st.optionalTabs.genres} onChange={v => st.setOptionalTab('genres', v)} />
        </Row>
        <Row label={t('appearance.tab.publishers')} hint={t('appearance.tab.publishersHint')}>
          <Toggle on={!!st.optionalTabs.publishers} onChange={v => st.setOptionalTab('publishers', v)} />
        </Row>
        <Row label={t('appearance.tab.playlists')} hint={t('appearance.tab.playlistsHint')}>
          <Toggle on={!!st.optionalTabs.playlists} onChange={v => st.setOptionalTab('playlists', v)} />
        </Row>
    </Panel>
  );

  return (
    <div ref={rootRef}>
      <SectionHead title={t('settings.appearance')} subtitle={t('appearance.subtitle')} />

      {/* Two glass panels: side by side at high resolution, stacked (with the
          settings pane scrolling) at low resolution. */}
      <div style={{ display: 'flex', flexDirection: stacked ? 'column' : 'row', gap: 24, alignItems: 'flex-start', maxWidth: 1080 }}>
        {themePanel}
        {shelfPanel}
      </div>
    </div>
  );
}
