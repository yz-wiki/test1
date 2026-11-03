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
import { useMemo, type MouseEvent as ReactMouseEvent } from 'react';
import type { OnyxState } from '../../state/onyx';
import { bookTitle, bookAuthor, fmtTime } from '../../state/onyx';
import { asPodcastItem, seekAudio } from '../../api/abs';
import { togglePlayback } from '../../api/playbook';
import { seekChapter } from '../../lib/chapterNav';
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

  // Prefer the stable snapshot so the bar survives a library switch; fall back to
  // the active library's derived current book for the in-library case.
  const item = st.playingItem ?? st.currentBook;
  const episode = st.currentEpisode;

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
            className="mac-iconbtn"
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
            className="mac-iconbtn"
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
        <VolumeControl st={st} compact style={{ padding: '2px 6px', background: 'transparent', border: 'none' }} />
        <button
          type="button"
          className="mac-iconbtn"
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
