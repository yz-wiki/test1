import { useEffect, useState } from 'react';
import { setAutoRewindCfg } from '../../api/abs';
import { autoRewindCfg } from '../../lib/playbackPrefs';
import { log } from '../../lib/log';
import { SPEEDS } from '../../state/onyx';
import type { OnyxState } from '../../state/onyx';
import { SectionHead, Row, Toggle, useLocal, MONO, Panel, Pill, Seg, SegGroup } from './shared';
import { clearAllPerBookSpeeds, rememberedSpeedCount } from '../../lib/speedMemory';
import type { UpNextMode } from '../../lib/upNext';
import ListeningSessionsSection from './ListeningSessionsSection';

// 'playback' shows the existing speed/skip/sleep controls.
// 'sessions' shows the paginated listening-sessions table.
type PlaybackTab = 'playback' | 'sessions';

export interface PlaybackSectionProps {
  st: OnyxState; // needed by ListeningSessionsSection for serverUrl and user type
}

export default function PlaybackSection({ st }: PlaybackSectionProps) {
  // Active subtab — persisted so the user returns to the same tab on re-open.
  const [tab, setTab] = useState<PlaybackTab>(() => {
    const stored = localStorage.getItem('onyx.playback.tab');
    return (stored === 'sessions' ? 'sessions' : 'playback') as PlaybackTab;
  });

  // Persist the tab choice whenever it changes.
  const switchTab = (t: PlaybackTab) => {
    localStorage.setItem('onyx.playback.tab', t);
    setTab(t);
  };

  const [speed, setSpeed]               = useLocal('onyx.playback.speed',       '1.0');
  const [skipDur, setSkipDur]           = useLocal('onyx.playback.skip',        '30s');
  const [rewindOnResume, setRewindOnResume] = useLocal('onyx.playback.rewind',  '5s');
  const [autoPlayNext, setAutoPlayNext] = useLocal('onyx.playback.autoPlayNext', true);
  // Cross-item continuation (Auto-Play Next). Deliberately NOT folded into
  // `autoPlayNext` above, which keeps its existing chapter-scoped meaning —
  // see upNextPrefs.ts for why the old boolean is left alone.
  const [bookUpNext, setBookUpNext]         = useLocal<UpNextMode>('onyx.playback.upNext.books', 'prompt');
  const [podcastUpNext, setPodcastUpNext]   = useLocal<UpNextMode>('onyx.playback.upNext.podcasts', 'prompt');
  const [upNextCountdown, setUpNextCountdown] = useLocal('onyx.playback.upNext.countdown', 10);
  const [sleepDefault, setSleepDefault] = useLocal('onyx.playback.sleepDefault', 'End of chapter');

  // Adaptive auto-rewind. `onyx.playback.rewind` above stays the fixed step —
  // these are additions beside it, never a reinterpretation of it, so turning
  // scaling back off restores exactly the behaviour the user had before.
  const [adaptive, setAdaptive]             = useLocal('onyx.playback.autoRewind.adaptive', false);
  const [rewindMin, setRewindMin]           = useLocal('onyx.playback.autoRewind.min', 1);
  const [rewindMax, setRewindMax]           = useLocal('onyx.playback.autoRewind.max', 30);
  const [rewindDelay, setRewindDelay]       = useLocal('onyx.playback.autoRewind.delay', 0);
  const [chapterBarrier, setChapterBarrier] = useLocal('onyx.playback.autoRewind.chapterBarrier', false);

  // Per-book speed memory. Default on: the feature is only useful if it works
  // before you go looking for it, and turning it off restores global-only
  // behaviour without discarding what was already remembered.
  const [perBookSpeed, setPerBookSpeed] = useLocal('onyx.playback.perBookSpeed', true);
  const [rememberedCount, setRememberedCount] = useState(() => rememberedSpeedCount());

  // The backend owns the resume decision, so every change has to reach it. Runs
  // on mount too, which is harmless (App.tsx pushes the same values) and means
  // the panel cannot leave the backend stale if it is opened before that.
  useEffect(() => {
    setAutoRewindCfg(autoRewindCfg()).catch(e =>
      log.warn('playback', 'auto-rewind config push failed', { err: String(e) }),
    );
  }, [adaptive, rewindMin, rewindMax, rewindDelay, chapterBarrier, rewindOnResume]);

  // Off / prompt / auto, in ascending order of how much the app does unasked.
  const UP_NEXT_MODES: Array<{ value: UpNextMode; label: string }> = [
    { value: 'off',    label: '停止' },
    { value: 'prompt', label: '询问'  },
    { value: 'auto',   label: '自动播放' },
  ];
  const COUNTDOWNS = [5, 10, 20, 30];

  const SKIP   = ['10s', '15s', '30s', '60s'];
  const REWIND = ['Off', '2s', '5s', '10s'];
  const SLEEP  = ['Off', '15m', '30m', '1h', 'End of chapter'];
  // Display labels for values that are also stored/compared verbatim. The raw
  // tokens above are what persists and what the backend/parsers compare; only
  // the rendered text is translated.
  const SKIP_LABELS: Record<string, string>  = { '10s': '10 秒', '15s': '15 秒', '30s': '30 秒', '60s': '60 秒' };
  const REWIND_LABELS: Record<string, string> = { Off: '关闭', '2s': '2 秒', '5s': '5 秒', '10s': '10 秒' };
  const SLEEP_LABELS: Record<string, string> = { Off: '关闭', '15m': '15 分钟', '30m': '30 分钟', '1h': '1 小时', 'End of chapter': '本章结束' };
  // Kept short and log-spaced: these are "feel" choices, not dial-in numbers.
  const MIN_STEPS = [1, 2, 5, 10];
  const MAX_STEPS = [15, 30, 60, 120];
  const DELAYS    = [0, 5, 15, 60];

  return (
    <div>
      <SectionHead title="播放" subtitle="开始播放新书时应用的默认设置。" />

      {/* Subtab pill toggle — Playback settings vs Listening Sessions */}
      <div style={{
        display: 'flex',
        padding: 3,
        gap: 3,
        background: 'var(--onyx-glass)',
        border: '1px solid var(--onyx-glass-edge)',
        borderRadius: 10,
        marginBottom: 28, // space before the active tab's content
        width: 'fit-content', // shrink-wrap to just the two pills
      }}>
        {([ { id: 'playback', label: '播放' }, { id: 'sessions', label: '收听时段' } ] as const).map(t => {
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => switchTab(t.id)}
              style={{
                padding: '7px 18px',
                borderRadius: 7,
                cursor: 'pointer',
                border: 'none',
                fontFamily: MONO,
                fontSize: 11,
                fontWeight: active ? 600 : 400,
                letterSpacing: '0.04em',
                // Active pill: dimmed gold background with inset ring (matches GreetingPane toggle).
                background: active ? 'var(--onyx-accent-dim)' : 'transparent',
                boxShadow: active ? 'inset 0 0 0 1px var(--onyx-accent-edge)' : 'none',
                color: active ? 'var(--onyx-accent)' : 'var(--onyx-text-dim)',
                transition: 'background 0.15s, color 0.15s',
              }}
            >
              {t.label}
            </button>
          );
        })}
      </div>

      {/* Sessions tab — renders the paginated listening-sessions table */}
      {tab === 'sessions' && <ListeningSessionsSection st={st} />}

      {/* Playback tab — existing speed/skip/sleep/auto-play controls, wrapped in a Panel */}
      {tab === 'playback' && (
        <Panel label="播放设置" style={{ marginTop: 0 }}>
          <Row label="默认播放倍速" hint="首次打开一本书时采用。书籍专属倍速优先于此设置。">
            <SegGroup>
              {SPEEDS.map(s => (
                <Seg key={s} active={s === speed} onClick={() => setSpeed(s)}>{s}×</Seg>
              ))}
            </SegGroup>
          </Row>

          <Row
            label="记住每本书的倍速"
            hint="每本书会记住你最后一次为其选择的倍速。关闭后，所有书籍都使用上面的默认倍速。"
          >
            <Toggle on={perBookSpeed} onChange={setPerBookSpeed} />
          </Row>

          {perBookSpeed && (
            <Row
              label="已保存的书籍倍速"
              hint={rememberedCount === 0
                ? '还没有书籍使用专属倍速。'
                : `${rememberedCount} 本书使用各自的专属倍速播放。`}
            >
              <Pill
                active={false}
                onClick={() => {
                  if (rememberedCount === 0) return;
                  clearAllPerBookSpeeds();
                  // Re-read rather than assume: the reset touches storage, and
                  // the count is what tells the user it worked.
                  setRememberedCount(rememberedSpeedCount());
                }}
              >
                全部重置
              </Pill>
            </Row>
          )}

          <Row label="跳进步长" hint="由 −/+ 跳转按钮与 ←/→ 方向键使用。">
            <SegGroup>
              {SKIP.map(v => <Seg key={v} active={v === skipDur} onClick={() => setSkipDur(v)}>{SKIP_LABELS[v] ?? v}</Seg>)}
            </SegGroup>
          </Row>

          <Row label="恢复播放时自动回退" hint="暂停后恢复时自动回退几秒。">
            <SegGroup>
              {REWIND.map(v => <Seg key={v} active={v === rewindOnResume} onClick={() => setRewindOnResume(v)}>{REWIND_LABELS[v] ?? v}</Seg>)}
            </SegGroup>
          </Row>

          <Row
            label="按离开时长调整回退"
            hint="离开时间越长回退越多，取代上面的固定步长。"
          >
            <Toggle on={adaptive} onChange={setAdaptive} />
          </Row>

          {/* The advanced controls only make sense once scaling is on — showing
              them inert would suggest the fixed step respects them, which it
              does not. */}
          {adaptive && (
            <>
              <Row label="最短回退" hint="短暂暂停后采用。">
                <SegGroup>
                  {MIN_STEPS.map(v => (
                    <Seg key={v} active={v === rewindMin} onClick={() => setRewindMin(v)}>{v} 秒</Seg>
                  ))}
                </SegGroup>
              </Row>

              <Row label="最长回退" hint="离开数小时后采用。">
                <SegGroup>
                  {MAX_STEPS.map(v => (
                    <Seg key={v} active={v === rewindMax} onClick={() => setRewindMax(v)}>{v} 秒</Seg>
                  ))}
                </SegGroup>
              </Row>

              <Row label="忽略短于此时长的暂停" hint="短暂中断时不回退。">
                <SegGroup>
                  {DELAYS.map(v => (
                    <Seg key={v} active={v === rewindDelay} onClick={() => setRewindDelay(v)}>
                      {v === 0 ? '关闭' : `${v} 秒`}
                    </Seg>
                  ))}
                </SegGroup>
              </Row>

              <Row label="不越出当前章节" hint="回退不会越过当前章节的起点。">
                <Toggle on={chapterBarrier} onChange={setChapterBarrier} />
              </Row>
            </>
          )}

          <Row label="自动播放下一章" hint="章节结束时不停顿、直接继续播放。适用于同一本书或单集内。">
            <Toggle on={autoPlayNext} onChange={setAutoPlayNext} />
          </Row>

          {/* Continuing into a different item is a separate decision from the
              chapter continuity above — it opens a new session and starts
              something the listener has not chosen — so it gets its own
              controls rather than riding on that toggle. */}
          <Row label="一本书结束时" hint="继续播放同一系列中的下一本书。">
            <SegGroup>
              {UP_NEXT_MODES.map(m => (
                <Seg key={m.value} active={m.value === bookUpNext} onClick={() => setBookUpNext(m.value)}>
                  {m.label}
                </Seg>
              ))}
            </SegGroup>
          </Row>

          <Row label="一集结束时" hint="继续播放下一集。每档播客节目保留各自的从旧到新或从新到旧顺序。">
            <SegGroup>
              {UP_NEXT_MODES.map(m => (
                <Seg key={m.value} active={m.value === podcastUpNext} onClick={() => setPodcastUpNext(m.value)}>
                  {m.label}
                </Seg>
              ))}
            </SegGroup>
          </Row>

          {(bookUpNext === 'prompt' || podcastUpNext === 'prompt') && (
            <Row label="询问前等待" hint="“接下来播放”面板在开始播放前等待的时长。">
              <SegGroup>
                {COUNTDOWNS.map(v => (
                  <Seg key={v} active={v === upNextCountdown} onClick={() => setUpNextCountdown(v)}>{v} 秒</Seg>
                ))}
              </SegGroup>
            </Row>
          )}

          <Row label="睡眠定时默认值" hint="打开睡眠定时时预填的值。">
            <SegGroup>
              {SLEEP.map(v => <Seg key={v} active={v === sleepDefault} onClick={() => setSleepDefault(v)}>{SLEEP_LABELS[v] ?? v}</Seg>)}
            </SegGroup>
          </Row>
        </Panel>
      )} {/* end tab === 'playback' */}
    </div>
  );
}
