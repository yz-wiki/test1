import { useState, useEffect, useRef } from 'react';
import { useI18n } from '../i18n';
import type { CSSProperties } from 'react';
import type { OnyxState, Chapter } from '../state/onyx';
import { seekAudio, createBookmark, getMe } from '../api/abs';
import { changeSpeed } from '../api/playbook';
// playBook: canonical entry point for starting a book from a stopped state.
// togglePlayback: pairs the LibVLC command with st.setPlaying for correct
// immediate state sync when resuming or pausing an already-open session.
import { playBook, togglePlayback } from '../api/playbook';
import {
  SPEEDS,
  chapterAt, chapterStart, fmtTime, // fmtRemaining removed — not used
  bookTitle, bookAuthor, bookSeries, bookNarrator, bookDur,
  bookProgress, bookCurrentTime, // bookSynopsis removed — not rendered
} from '../state/onyx';
import Cover from './Cover';
import Icon from './Icon';
import { sanitizeHtml } from '../lib/sanitize';
import { log } from '../lib/log';

// One family for interface text; monospace is opt-in via .ui-tech.
const UI_STACK = 'var(--font-ui)';

const SERIF = UI_STACK;
const MONO = UI_STACK;
type CtxKind = 'series' | 'author' | 'narrator' | 'collection';

export interface FocusPanelProps {
  st: OnyxState;
}

function seriesNameOf(s: string | undefined): string {
  return (s || '').split(' · ')[0];
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ padding: 'var(--s-1) var(--s-3) var(--s-2)' }}>
      <div style={{ fontFamily: MONO, fontSize: 'var(--fs-0)', color: 'var(--onyx-text-mute)', letterSpacing: '0.12em', textTransform: 'uppercase' }}>
        {label}
      </div>
      <div style={{ marginTop: 'var(--s-1)', fontSize: 'var(--fs-5)', fontWeight: 500 }}>{value}</div>
    </div>
  );
}

function ChaptersStat({ st, chIdx, chapterCount, chapters }: { st: OnyxState; chIdx: number; chapterCount: number; chapters: Chapter[] }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener('mousedown', onDown);
    return () => window.removeEventListener('mousedown', onDown);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const el = listRef.current?.querySelector('[data-current="true"]') as HTMLElement | null;
    el?.scrollIntoView({ block: 'center' });
  }, [open]);

  const jump = (i: number) => {
    const pos = chapterStart(chapters, i);
    seekAudio(pos).catch(e => log.error('playback', 'chapter seek failed', { err: String(e) }));
    st.setPosition(pos);
    setOpen(false);
  };

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen(o => !o)}
        title={t('focus.jumpToChapter')}
        style={{
          background: open ? 'var(--onyx-accent-dim)' : 'transparent',
          border: `1px solid ${open ? 'var(--onyx-accent-edge)' : 'transparent'}`,
          borderRadius: 'var(--r-md)', padding: 'var(--s-1) var(--s-3) var(--s-2)', cursor: 'pointer',
          textAlign: 'left', fontFamily: 'inherit', color: 'inherit',
          display: 'flex', alignItems: 'baseline', gap: 'var(--s-2)',
        }}
      >
        <div>
          <div style={{ fontFamily: MONO, fontSize: 'var(--fs-0)', color: 'var(--onyx-text-mute)', letterSpacing: '0.12em', textTransform: 'uppercase' }}>{t('focus.chapters')}</div>
          <div style={{ marginTop: 'var(--s-1)', fontSize: 'var(--fs-5)', fontWeight: 500, color: open ? 'var(--onyx-accent)' : 'var(--onyx-text)' }}>
            {chapterCount}
          </div>
        </div>
        <span style={{ color: 'var(--onyx-text-mute)', transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s', alignSelf: 'center', marginTop: 'var(--s-2)', display: 'inline-flex' }}>
          <Icon name="chevron-down" size={10} />
        </span>
      </button>

      {open && (
        <div style={{
          position: 'absolute', bottom: 'calc(100% + 8px)', left: 0,
          width: 280, maxWidth: '100%', maxHeight: 320,
          background: 'var(--surface-overlay)', border: '1px solid var(--onyx-line)', borderRadius: 'var(--r-card)',
          boxShadow: 'var(--shadow-popover)',
          padding: 'var(--s-2)', zIndex: 100, display: 'flex', flexDirection: 'column',
        }}>
          <div style={{ padding: 'var(--s-2) var(--s-2) var(--s-1)', fontFamily: MONO, fontSize: 'var(--fs-0)', color: 'var(--onyx-text-mute)', letterSpacing: '0.12em', textTransform: 'uppercase' }}>
            {t('focus.jumpToChapter')}
          </div>
          <div ref={listRef} style={{ overflowY: 'auto', flex: 1, minHeight: 0 }}>
            {chapters.map((c, i) => {
              const chState = i < chIdx ? 'done' : i === chIdx ? 'playing' : 'next';
              return (
                <button
                  key={c.n}
                  data-current={chState === 'playing' ? 'true' : 'false'}
                  onClick={() => jump(i)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 'var(--s-3)', padding: 'var(--s-2) var(--s-3)', borderRadius: 'var(--r-sm)',
                    background: chState === 'playing' ? 'var(--onyx-accent-dim)' : 'transparent',
                    border: 'none', width: '100%', cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left',
                    marginBottom: '2px',
                  }}
                >
                  <div style={{ fontFamily: MONO, fontSize: 'var(--fs-0)', color: chState === 'playing' ? 'var(--onyx-accent)' : 'var(--onyx-text-mute)', width: 22, flexShrink: 0 }}>
                    {String(c.n).padStart(2, '0')}
                  </div>
                  <div style={{ flex: 1, minWidth: 0, fontSize: 'var(--fs-2)', fontWeight: chState === 'playing' ? 600 : 400, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: chState === 'done' ? 'var(--onyx-text-mute)' : chState === 'playing' ? 'var(--onyx-accent)' : 'var(--onyx-text)' }}>
                    {c.t || `Chapter ${c.n}`}
                  </div>
                  {chState === 'done' && (
                    <span style={{ color: 'var(--onyx-text-mute)', flexShrink: 0, display: 'inline-flex' }}>
                      <Icon name="check" size={10} />
                    </span>
                  )}
                  {chState === 'playing' && (
                    <div style={{ width: 5, height: 5, borderRadius: 'var(--r-xs)', background: 'var(--onyx-accent)', boxShadow: '0 0 10px var(--onyx-accent)', flexShrink: 0 }} />
                  )}
                  {chState === 'next' && <div style={{ width: 10, flexShrink: 0 }} />}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function SpeedStat({ st }: { st: OnyxState }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener('mousedown', onDown);
    return () => window.removeEventListener('mousedown', onDown);
  }, [open]);

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen(o => !o)}
        title={t('focus.changeSpeed')}
        style={{
          background: open ? 'var(--onyx-accent-dim)' : 'transparent',
          border: `1px solid ${open ? 'var(--onyx-accent-edge)' : 'transparent'}`,
          borderRadius: 'var(--r-md)', padding: 'var(--s-1) var(--s-3) var(--s-2)', cursor: 'pointer',
          textAlign: 'left', fontFamily: 'inherit', color: 'inherit',
          display: 'flex', alignItems: 'baseline', gap: 'var(--s-2)',
        }}
      >
        <div>
          <div style={{ fontFamily: MONO, fontSize: 'var(--fs-0)', color: 'var(--onyx-text-mute)', letterSpacing: '0.12em', textTransform: 'uppercase' }}>{t('focus.speed')}</div>
          <div style={{ marginTop: 'var(--s-1)', fontSize: 'var(--fs-5)', fontWeight: 500, color: open ? 'var(--onyx-accent)' : 'var(--onyx-text)' }}>
            {st.speed}×
          </div>
        </div>
        <span style={{ color: 'var(--onyx-text-mute)', transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s', alignSelf: 'center', marginTop: 'var(--s-2)', display: 'inline-flex' }}>
          <Icon name="chevron-down" size={10} />
        </span>
      </button>

      {open && (
        <div style={{
          position: 'absolute', bottom: 'calc(100% + 8px)', left: -4,
          background: 'var(--surface-overlay)', border: '1px solid var(--onyx-line)', borderRadius: 'var(--r-card)',
          boxShadow: 'var(--shadow-popover)',
          padding: 'var(--s-2)', zIndex: 100, minWidth: 130,
        }}>
          <div style={{ fontFamily: MONO, fontSize: 'var(--fs-0)', color: 'var(--onyx-text-mute)', letterSpacing: '0.12em', padding: 'var(--s-2) var(--s-2) var(--s-1)', textTransform: 'uppercase' }}>
            {t('focus.speedHeading')}
          </div>
          {SPEEDS.map(s => (
            <button
              key={s}
              onClick={() => {
                setOpen(false);
                // changeSpeed records the rate against the current book, so it
                // is still there next time this one is opened.
                changeSpeed(st, st.currentBookId, s).catch(err =>
                  log.error('playback', 'set speed failed', { speed: s, err: String(err) }));
              }}
              style={{
                display: 'flex', alignItems: 'center', gap: 'var(--s-3)', padding: 'var(--s-2) var(--s-3)', borderRadius: 'var(--r-sm)',
                background: s === st.speed ? 'var(--onyx-accent-dim)' : 'transparent',
                border: 'none', width: '100%', cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left',
              }}
            >
              <span style={{ fontFamily: MONO, fontSize: 'var(--fs-3)', color: s === st.speed ? 'var(--onyx-accent)' : 'var(--onyx-text)', fontWeight: s === st.speed ? 600 : 400, flex: 1 }}>
                {s}×
              </span>
              {s === st.speed && (
                <span style={{ color: 'var(--onyx-accent)', display: 'inline-flex' }}>
                  <Icon name="check" size={11} />
                </span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function CollapseHandle({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) {
  return (
    <button
      onClick={onToggle}
      title={collapsed ? 'Expand panel' : 'Collapse panel'}
      style={{
        position: 'absolute', top: 0, bottom: 0, right: -1, width: 22,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'transparent', border: 'none', padding: '0', cursor: 'pointer', zIndex: 5,
      }}
    >
      {/* Just a small chevron knob — no full-height accent bar (that read as a
          stray "glow" along the panel edge). The knob still toggles collapse. */}
      <div style={{
        width: 22, height: 44, borderRadius: 'var(--r-card)',
        background: 'var(--surface-overlay)', border: '1px solid var(--onyx-glass-edge)',
        boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: 'var(--onyx-text-dim)',
      }}>
        <Icon name={collapsed ? 'chevron-right' : 'chevron-left'} size={12} />
      </div>
    </button>
  );
}

export default function FocusPanel({ st }: FocusPanelProps) {
  const { t } = useI18n();
  const [drawerTab, setDrawerTab] = useState<'bookmarks' | 'synopsis'>('synopsis');

  const focus = st.currentBook;
  if (!focus) return null;

  const focusBookmarks = st.bookmarks.filter(b => b.libraryItemId === st.currentBookId);

  const totalSecs = st.bookSecs;
  const focusProgress = st.currentBookId === focus.id
    ? st.position / (totalSecs || 1)
    : bookProgress(focus, st.mediaProgress);
  const chapters = st.currentBookChapters;
  const { idx: chIdx } = chapterAt(chapters, st.position);
  const chapterCount = chapters.length;
  const seriesLabel = seriesNameOf(bookSeries(focus));

  const toggleContext = (kind: CtxKind, value: string) => {
    if (st.contextFilter?.kind === kind && st.contextFilter?.value === value) {
      st.setContextFilter(null);
    } else {
      st.setContextFilter({ kind, value });
    }
  };

  const ctxIs = (kind: CtxKind, value: string): boolean =>
    !!st.contextFilter && st.contextFilter.kind === kind && st.contextFilter.value === value;

  const openBook = (id: string) => {
    st.setCurrentBookId(id);
    // Align focusedBookId with the book the panel displays. The Player renders
    // `focusedBook ?? currentBook`, so without this the player would show a
    // stale focused book (e.g. one selected in the shelf) rather than the book
    // shown in this panel.
    st.setFocusedBookId(id);
    if (id !== st.currentBookId) {
      const b = st.library.find(x => x.id === id);
      if (b) st.setPosition(bookCurrentTime(b, st.mediaProgress));
    }
    st.setScreen('player');
  };

  const handleContinue = async () => {
    // Mirrors the Player view's handlePlayPause: decide using the same props the
    // icon reads (st.playing / st.currentBookId) so the icon and the action can
    // never disagree. Only cold-start for a different book or a missing session.
    try {
      if (st.isLocalPlayback) {
        // Local playback has no server session — toggle audio directly.
        await togglePlayback(st);
      } else if (st.playing && st.currentBookId === focus.id) {
        // This book is playing (icon shows pause) → pause.
        await togglePlayback(st);
      } else if (st.sessionReady && st.currentBookId === focus.id) {
        // Session open for this book but paused → resume from current position.
        await togglePlayback(st);
      } else {
        // Different book or no open session → cold start from saved position.
        await playBook(st, focus.id);
      }
    } catch (err) {
      log.error('playback', 'continue/play from focus card failed', { err: String(err) });
    }
  };

  if (st.focusCollapsed) {
    return (
      <div
        className="ui-card"
        style={{ width: 76, padding: 'var(--s-4) 0', display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0, position: 'relative', gap: 'var(--s-4)' }}
      >
        <CollapseHandle collapsed onToggle={() => st.setFocusCollapsed(false)} />
        <div onClick={() => openBook(focus.id)} style={{ cursor: 'pointer' }}>
          <Cover item={focus} size={48} serverUrl={st.serverUrl} />
        </div>
        <button
          // Use handleContinue — same as the main play button.
          // Direct setPlaying() does not invoke LibVLC; it only flips the icon
          // while audio keeps running, causing an immediate re-open on pause.
          onClick={() => handleContinue()}
          style={{ width: 32, height: 32, borderRadius: 'var(--r-overlay)', border: 'none', background: 'var(--onyx-accent)', color: 'var(--onyx-bg)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        >
          <Icon name={st.playing && st.currentBookId === focus.id ? 'pause' : 'play'} size={12} />
        </button>
        <div style={{ width: 2, flex: 1, background: 'rgba(255,255,255,0.08)', borderRadius: 1, overflow: 'hidden', position: 'relative' }}>
          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: `${focusProgress * 100}%`, background: 'var(--onyx-accent)' }} />
        </div>
        <div style={{ fontFamily: MONO, fontSize: 'var(--fs-0)', color: 'var(--onyx-text-mute)', writingMode: 'vertical-rl', transform: 'rotate(180deg)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
          {bookTitle(focus)}
        </div>
      </div>
    );
  }

  const focusSeries = bookSeries(focus);
  const focusAuthor = bookAuthor(focus);
  const focusNarrator = bookNarrator(focus);
  return (
    <div
      className="ui-card"
      style={{ width: 340, padding: 'var(--s-5)', display: 'flex', flexDirection: 'column', flexShrink: 0, position: 'relative', overflow: 'visible' }}
    >
      <CollapseHandle collapsed={false} onToggle={() => st.setFocusCollapsed(true)} />

      <div className="ui-group-label" style={{ marginBottom: 'var(--s-3)' }}>
        {t('focus.inFocus')}
      </div>

      <div onClick={() => openBook(focus.id)} style={{ cursor: 'pointer' }}>
        <Cover item={focus} size={300} serverUrl={st.serverUrl} />
      </div>

      {focusSeries && (
        <button
          onClick={() => toggleContext('series', seriesLabel)}
          title={ctxIs('series', seriesLabel) ? 'Clear series filter' : `Show all books in ${seriesLabel}`}
          style={{ marginTop: 'var(--s-6)', alignSelf: 'flex-start', fontFamily: MONO, fontSize: 'var(--fs-1)', letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--onyx-accent)', background: 'none', border: 'none', padding: '0', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 'var(--s-2)' }}
        >
          {focusSeries}
          <span style={{ opacity: 0.7, display: 'inline-flex' }}>
            <Icon name={ctxIs('series', seriesLabel) ? 'chevron-down' : 'chevron-right'} size={10} />
          </span>
        </button>
      )}

      <div className="ui-h2" style={{ marginTop: focusSeries ? 'var(--s-1)' : 'var(--s-5)', fontSize: 'var(--fs-6)' }}>
        {bookTitle(focus)}
      </div>

      <div style={{ marginTop: 'var(--s-2)', fontSize: 'var(--fs-4)', color: 'var(--onyx-text-dim)', display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', gap: '0 4px' }}>
        <span>{t('focus.by')}</span>
        <button
          onClick={() => toggleContext('author', focusAuthor)}
          title={ctxIs('author', focusAuthor) ? 'Clear author filter' : `Show all books by ${focusAuthor}`}
          style={{
            background: 'none', border: 'none', padding: '0', cursor: 'pointer',
            fontFamily: 'inherit', fontSize: 'inherit',
            color: ctxIs('author', focusAuthor) ? 'var(--onyx-accent)' : 'var(--onyx-text)',
            borderBottom: `1px dashed ${ctxIs('author', focusAuthor) ? 'var(--onyx-accent)' : 'var(--onyx-line)'}`,
          }}
        >
          {focusAuthor}
        </button>
        {focusNarrator && (
          <>
            <span style={{ color: 'var(--onyx-text-mute)' }}>·</span>
            <button
              onClick={() => toggleContext('narrator', focusNarrator)}
              title={ctxIs('narrator', focusNarrator) ? 'Clear narrator filter' : `Show all books narrated by ${focusNarrator}`}
              style={{
                background: 'none', border: 'none', padding: '0', cursor: 'pointer',
                fontFamily: 'inherit', fontSize: 'inherit',
                color: ctxIs('narrator', focusNarrator) ? 'var(--onyx-accent)' : 'var(--onyx-text-dim)',
                borderBottom: `1px dashed ${ctxIs('narrator', focusNarrator) ? 'var(--onyx-accent)' : 'var(--onyx-text-mute)'}`,
              }}
            >
              {focusNarrator}
            </button>
          </>
        )}
      </div>

      <div style={{ marginTop: 'var(--s-5)', display: 'flex', gap: 'var(--s-3)' }}>
        <button
          onClick={() => handleContinue()}
          style={{ flex: 1, height: 44, background: 'var(--onyx-accent)', color: 'var(--onyx-bg)', border: 'none', borderRadius: 'var(--r-card)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 'var(--s-2)', fontWeight: 600, fontSize: 'var(--fs-4)', cursor: 'pointer', fontFamily: 'inherit' }}
        >
          <Icon name={st.playing && st.currentBookId === focus.id ? 'pause' : 'play'} size={14} />
          {st.playing && st.currentBookId === focus.id ? 'Pause' : 'Play'}
        </button>
        <button
          title={t('focus.bookmark')}
          onClick={async () => {
            try {
              const { chapter } = chapterAt(st.currentBookChapters, st.position);
              const title = chapter?.t
                ? `${chapter.t} — ${fmtTime(st.position)}`
                : fmtTime(st.position);
              await createBookmark(st.serverUrl, st.currentBookId, st.position, title);
              const me = await getMe(st.serverUrl);
              st.setBookmarks(me.bookmarks);
            } catch (err) {
              log.error('playback', 'create bookmark failed', { err: String(err) });
            }
          }}
          style={{ width: 44, height: 44, background: 'var(--onyx-glass-strong)', border: '1px solid var(--onyx-glass-edge)', borderRadius: 'var(--r-card)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--onyx-text-dim)', cursor: 'pointer' }}
        >
          <Icon name="bookmark" size={16} />
        </button>
      </div>

      <div style={{ marginTop: 'var(--s-4)', height: 3, background: 'rgba(255,255,255,0.08)', borderRadius: 'var(--r-xs)', overflow: 'hidden' }}>
        <div style={{ width: `${focusProgress * 100}%`, height: '100%', background: 'var(--onyx-accent)', transition: 'width 0.2s' }} />
      </div>

      <div style={{ marginTop: 'var(--s-2)', fontFamily: MONO, fontSize: 'var(--fs-0)', color: 'var(--onyx-text-mute)', letterSpacing: '0.06em' }}>
        {Math.round(focusProgress * 100)}% · Ch. {chIdx + 1} / {chapterCount}
      </div>

      <div style={{ marginTop: 'var(--s-4)', display: 'flex', gap: 'var(--s-1)' }}>
        <button
          onClick={() => setDrawerTab('synopsis')}
          style={{
            fontFamily: MONO, fontSize: 'var(--fs-0)', letterSpacing: '0.1em', textTransform: 'uppercase',
            padding: 'var(--s-1) var(--s-3)', borderRadius: 'var(--r-sm)', cursor: 'pointer',
            background: drawerTab === 'synopsis' ? 'var(--onyx-accent-dim)' : 'transparent',
            border: `1px solid ${drawerTab === 'synopsis' ? 'var(--onyx-accent-edge)' : 'var(--onyx-glass-edge)'}`,
            color: drawerTab === 'synopsis' ? 'var(--onyx-accent)' : 'var(--onyx-text-mute)',
          }}
        >
          {t('focus.synopsis')}
        </button>
        <button
          onClick={() => setDrawerTab('bookmarks')}
          style={{
            fontFamily: MONO, fontSize: 'var(--fs-0)', letterSpacing: '0.1em', textTransform: 'uppercase',
            padding: 'var(--s-1) var(--s-3)', borderRadius: 'var(--r-sm)', cursor: 'pointer',
            background: drawerTab === 'bookmarks' ? 'var(--onyx-accent-dim)' : 'transparent',
            border: `1px solid ${drawerTab === 'bookmarks' ? 'var(--onyx-accent-edge)' : 'var(--onyx-glass-edge)'}`,
            color: drawerTab === 'bookmarks' ? 'var(--onyx-accent)' : 'var(--onyx-text-mute)',
            display: 'flex', alignItems: 'center', gap: 'var(--s-1)',
          }}
        >
          <Icon name="bookmark" size={9} />
          Bookmarks{focusBookmarks.length > 0 ? ` (${focusBookmarks.length})` : ''}
        </button>
      </div>

      <div style={{ marginTop: 'var(--s-3)', flex: 1, minHeight: 0, overflowY: 'auto' }}>
        {drawerTab === 'bookmarks' ? (
          focusBookmarks.length > 0 ? (
            <div>
              {focusBookmarks.map((bm, i) => (
                <button
                  key={i}
                  onClick={() => { st.setPosition(bm.time); st.setScreen('player'); }}
                  style={{ display: 'flex', alignItems: 'flex-start', gap: 'var(--s-3)', padding: 'var(--s-2) 0', background: 'none', border: 'none', borderTop: i > 0 ? '1px solid var(--onyx-line)' : 'none', width: '100%', cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit', color: 'inherit' }}
                >
                  <div style={{ fontFamily: MONO, fontSize: 'var(--fs-0)', fontWeight: 600, color: 'var(--onyx-accent)', paddingTop: '2px', flexShrink: 0 }}>{fmtTime(bm.time)}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 'var(--fs-2)', color: 'var(--onyx-text)', lineHeight: 1.35, overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' } as CSSProperties}>
                      {bm.title}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <div style={{ fontFamily: MONO, fontSize: 'var(--fs-0)', color: 'var(--onyx-text-mute)', padding: 'var(--s-3) 0' }}>{t('focus.noBookmarks')}</div>
          )
        ) : focus.media.metadata.description ? (
          <div
            style={{ fontFamily: SERIF, fontSize: 'var(--fs-4)', lineHeight: 1.55, color: 'var(--onyx-text-dim)', paddingTop: 'var(--s-1)' }}
            // Remote HTML (ABS metadata / RSS) — allowlist-sanitized before render.
            dangerouslySetInnerHTML={{ __html: sanitizeHtml(focus.media.metadata.description) }}
          />
        ) : (
          <div style={{ fontFamily: SERIF, fontSize: 'var(--fs-4)', lineHeight: 1.55, color: 'var(--onyx-text-dim)', paddingTop: 'var(--s-1)' }}>
            {t('focus.noSynopsis')}
          </div>
        )}
      </div>

      <div style={{ marginTop: '0', paddingTop: 'var(--s-5)', borderTop: '1px solid var(--onyx-line)', display: 'flex', gap: 'var(--s-6)', overflow: 'visible' }}>
        <Stat label={t('focus.duration')} value={bookDur(focus)} />
        <ChaptersStat st={st} chIdx={chIdx} chapterCount={chapterCount} chapters={chapters} />
        <SpeedStat st={st} />
      </div>
    </div>
  );
}
