// Persistent now-playing bar.
//
// The macOS music-app pattern: playback stays controllable from every screen, so
// the user never has to navigate back to a "player" to pause or skip. It is
// deliberately *not* a second Player screen — no chapters, no equaliser, no
// sleep timer — only the five things worth a click: metadata (opens the Player),
// transport, scrub, volume, and expand.
//
// Hidden on the Player screen itself (which already owns the full transport) and
// when nothing is loaded.
import { useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react';
import type { OnyxState } from '../../state/onyx';
import { bookTitle, bookAuthor, fmtTime } from '../../state/onyx';
import { asPodcastItem, seekAudio } from '../../api/abs';
import { togglePlayback } from '../../api/playbook';
import { chapterIndexAt, chapterStarts, seekChapter } from '../../lib/chapterNav';
import { log } from '../../lib/log';
import { useI18n } from '../../i18n';
import Cover from '../Cover';
import Icon from '../Icon';
import VolumeControl from '../chrome/VolumeControl';

export interface NowPlayingBarProps {
  st: OnyxState;
  onExpand: () => void;
}

export default function NowPlayingBar({ st, onExpand }: NowPlayingBarProps) {
  const { t } = useI18n();
  const [chaptersOpen, setChaptersOpen] = useState(false);
  const chaptersRef = useRef<HTMLDivElement>(null);

  // Dismiss the chapter popover on any click outside it, and on Escape.
  useEffect(() => {
    if (!chaptersOpen) return;
    const onDown = (event: MouseEvent) => {
      if (chaptersRef.current && !chaptersRef.current.contains(event.target as Node)) {
        setChaptersOpen(false);
      }
    };
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') setChaptersOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [chaptersOpen]);

  // Prefer the stable snapshot so the bar survives a library switch; fall back to
  // the active library's derived current book for the in-library case.
  const item = st.playingItem ?? st.currentBook;
  const episode = st.currentEpisode;

  const chapterList = st.currentBookChapters;
  const starts = useMemo(() => chapterStarts(st), [st.currentBookChapters]); // eslint-disable-line react-hooks/exhaustive-deps
  const activeChapter = chapterIndexAt(st, st.position);

  const progress = useMemo(() => {
    if (st.bookSecs <= 0) return 0;
    return Math.max(0, Math.min(1, st.position / st.bookSecs));
  }, [st.position, st.bookSecs]);

  if (!st.currentBookId || !item) return null;

  const isPodcast = !!episode;
  const title = isPodcast ? (episode?.title || bookTitle(item)) : bookTitle(item);
  const subtitle = isPodcast
    ? asPodcastItem(item).media?.metadata?.title ?? ''
    : bookAuthor(item) || '';

  const toggle = () => {
    void togglePlayback(st).catch(error =>
      log.warn('playback', 'now-playing toggle failed', { err: String(error) }));
  };

  const scrub = (event: ReactMouseEvent<HTMLDivElement>) => {
    if (st.bookSecs <= 0) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
    const target = ratio * st.bookSecs;
    st.setPosition(target);
    void seekAudio(target).catch(error =>
      log.warn('playback', 'now-playing seek failed', { err: String(error) }));
  };

  return (
    <div className="mac-nowbar" role="region" aria-label={t('player.nowPlaying')}>
      {/* ── Metadata ──────────────────────────────────────────────────────── */}
      <button type="button" className="mac-nowbar__meta" onClick={onExpand} title={t('palette.action.openPlayer')}>
        <span className="mac-nowbar__cover">
          <Cover item={item} size={42} serverUrl={st.serverUrl} />
        </span>
        <span className="mac-nowbar__titles">
          <span className="mac-nowbar__title">{title}</span>
          <span className="mac-nowbar__subtitle">{subtitle}</span>
        </span>
      </button>

      {/* ── Transport + scrub ─────────────────────────────────────────────── */}
      <div className="mac-nowbar__center">
        <div className="mac-nowbar__transport">
          <button
            type="button"
            className="ui-iconbtn"
            onClick={() => seekChapter(st, -1)}
            title={t('palette.action.prevChapter')}
            aria-label={t('palette.action.prevChapter')}
          >
            <Icon name="prev-chapter" size={15} />
          </button>
          <button
            type="button"
            className="mac-nowbar__play"
            onClick={toggle}
            title={st.playing ? t('player.pause') : t('player.play')}
            aria-label={st.playing ? t('player.pause') : t('player.play')}
          >
            <Icon name={st.playing ? 'pause' : 'play'} size={17} />
          </button>
          <button
            type="button"
            className="ui-iconbtn"
            onClick={() => seekChapter(st, 1)}
            title={t('palette.action.nextChapter')}
            aria-label={t('palette.action.nextChapter')}
          >
            <Icon name="next-chapter" size={15} />
          </button>
        </div>

        <div className="mac-nowbar__scrub">
          <span className="mac-nowbar__time">{fmtTime(st.position)}</span>
          <div
            className="mac-nowbar__track"
            role="slider"
            tabIndex={0}
            aria-label={t('player.seek')}
            aria-valuemin={0}
            aria-valuemax={Math.max(0, Math.round(st.bookSecs))}
            aria-valuenow={Math.round(st.position)}
            aria-valuetext={`${fmtTime(st.position)} / ${fmtTime(st.bookSecs)}`}
            onClick={scrub}
            onKeyDown={(event) => {
              // ±30s matches the global skip shortcuts, so keyboard behaviour is
              // consistent between the bar and the rest of the app.
              if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
              event.preventDefault();
              const delta = event.key === 'ArrowLeft' ? -30 : 30;
              const target = Math.max(0, Math.min(st.bookSecs, st.position + delta));
              st.setPosition(target);
              void seekAudio(target).catch(error =>
                log.warn('playback', 'now-playing seek failed', { err: String(error) }));
            }}
          >
            <div className="mac-nowbar__fill" style={{ width: `${progress * 100}%` }} />
          </div>
          <span className="mac-nowbar__time">{fmtTime(st.bookSecs)}</span>
        </div>
      </div>

      {/* ── Utilities ─────────────────────────────────────────────────────── */}
      <div className="mac-nowbar__right">
        {chapterList.length > 0 && (
          <div ref={chaptersRef} style={{ position: 'relative' }}>
            <button
              type="button"
              className={`ui-iconbtn${chaptersOpen ? ' ui-iconbtn--active' : ''}`}
              onClick={() => setChaptersOpen(open => !open)}
              title={t('player.selectChapter')}
              aria-label={t('player.selectChapter')}
              aria-haspopup="listbox"
              aria-expanded={chaptersOpen}
            >
              <Icon name="list" size={15} />
            </button>
            {chaptersOpen && (
              <div
                role="listbox"
                aria-label={t('player.selectChapter')}
                className="ui-popover"
                style={{
                  position: 'absolute',
                  bottom: 'calc(100% + 10px)',
                  right: 0,
                  width: 300,
                  maxHeight: 320,
                  overflowY: 'auto',
                  padding: 6,
                  zIndex: 120,
                  background: 'var(--mac-panel-bg-strong)',
                }}
              >
                {chapterList.map((chapter, index) => {
                  const at = starts[index] ?? 0;
                  const active = index === activeChapter;
                  return (
                    <button
                      key={`${chapter.n}-${index}`}
                      type="button"
                      role="option"
                      aria-selected={active}
                      className="ui-list__item"
                      onClick={() => {
                        st.setPosition(at);
                        void seekAudio(at).catch(() => {});
                        setChaptersOpen(false);
                      }}
                      style={active ? { background: 'var(--onyx-accent-dim)', fontWeight: 600 } : undefined}
                    >
                      <span className="mac-nav-item__icon">
                        <span style={{ fontFamily: 'var(--mac-font-mono)', fontSize: 10, minWidth: 18, textAlign: 'right' }}>
                          {index + 1}
                        </span>
                      </span>
                      <span className="mac-nav-item__label">{chapter.t || `#${index + 1}`}</span>
                      <span className="mac-nav-item__badge" style={{ background: 'transparent' }}>
                        {fmtTime(at)}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}
        <span className="mac-nowbar__volume" style={{ display: 'inline-flex' }}>
          <VolumeControl st={st} compact style={{ padding: '2px 6px', background: 'transparent', border: 'none' }} />
        </span>
        <button
          type="button"
          className="ui-iconbtn"
          onClick={onExpand}
          title={t('palette.action.openPlayer')}
          aria-label={t('palette.action.openPlayer')}
        >
          <Icon name="chevron-right" size={15} />
        </button>
      </div>
    </div>
  );
}
