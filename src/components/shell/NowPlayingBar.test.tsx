// Now-playing bar contract tests.
//
// The bar is the only transport available on nine of the ten screens, so its
// three guarantees matter more than its looks: it shows what is playing, it can
// pause, and its scrub surface reports an accurate position to screen readers.
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { OnyxState } from '../../state/onyx';

const playbook = vi.hoisted(() => ({ togglePlayback: vi.fn(async () => {}) }));

vi.mock('../../api/playbook', () => ({ togglePlayback: playbook.togglePlayback }));

vi.mock('../../api/abs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../api/abs')>();
  return {
    ...actual,
    seekAudio: vi.fn(async () => {}),
    asPodcastItem: () => ({ media: { metadata: { title: 'Test Podcast' } } }),
  };
});

import NowPlayingBar from './NowPlayingBar';

const book = {
  id: 'book-1',
  mediaType: 'book',
  media: {
    metadata: { title: 'The Long Way', authorName: 'Ada Lovelace' },
    chapters: [],
    duration: 3600,
  },
} as unknown as OnyxState['currentBook'];

function makeState(overrides: Partial<OnyxState> = {}): OnyxState {
  return {
    currentBookId: 'book-1',
    currentBook: book,
    playingItem: book,
    currentEpisode: null,
    playing: false,
    position: 120,
    bookSecs: 3600,
    serverUrl: '',
    volume: 0.8,
    muted: false,
    setVolume: vi.fn(),
    setMuted: vi.fn(),
    setPosition: vi.fn(),
    currentBookChapters: [
      { n: 1, t: 'One', dur: 600 },
      { n: 2, t: 'Two', dur: 600 },
    ],
    ...overrides,
  } as unknown as OnyxState;
}

describe('NowPlayingBar', () => {
  beforeEach(() => vi.clearAllMocks());

  it('shows the current title, author and elapsed time', () => {
    const { container } = render(<NowPlayingBar st={makeState()} onExpand={() => {}} />);
    // Both the bar's title line and the generated cover template render the
    // title, so scope the assertion to the metadata block.
    const meta = container.querySelector('.mac-nowbar__meta');
    expect(meta?.textContent).toContain('The Long Way');
    expect(meta?.textContent).toContain('Ada Lovelace');
    expect(screen.getByText('2:00')).toBeTruthy();
    expect(screen.getByText('1:00:00')).toBeTruthy();
  });

  it('renders nothing when no book is loaded', () => {
    const { container } = render(
      <NowPlayingBar st={makeState({ currentBookId: '', currentBook: undefined, playingItem: undefined })} onExpand={() => {}} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('toggles playback from the centre button', () => {
    const st = makeState({ playing: true });
    render(<NowPlayingBar st={st} onExpand={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: /Pause/i }));
    expect(playbook.togglePlayback).toHaveBeenCalledWith(st);
  });

  it('exposes the scrub position as an accessible slider', () => {
    render(<NowPlayingBar st={makeState()} onExpand={() => {}} />);
    const slider = screen.getByRole('slider', { name: /Seek/i });
    expect(slider.getAttribute('aria-valuenow')).toBe('120');
    expect(slider.getAttribute('aria-valuemax')).toBe('3600');
  });

  it('seeks on keyboard arrows by the 30s skip step', () => {
    const st = makeState();
    render(<NowPlayingBar st={st} onExpand={() => {}} />);
    const slider = screen.getByRole('slider', { name: /Seek/i });
    fireEvent.keyDown(slider, { key: 'ArrowRight' });
    expect(st.setPosition).toHaveBeenCalledWith(150);
    fireEvent.keyDown(slider, { key: 'ArrowLeft' });
    expect(st.setPosition).toHaveBeenCalledWith(90);
  });

  it('opens the full player from the metadata block', () => {
    const onExpand = vi.fn();
    render(<NowPlayingBar st={makeState()} onExpand={onExpand} />);
    // Two affordances expand the player (metadata block and the chevron); the
    // chevron is the last one in DOM order.
    const expanders = screen.getAllByTitle(/full player/i);
    fireEvent.click(expanders[expanders.length - 1]);
    expect(onExpand).toHaveBeenCalled();
  });
});
