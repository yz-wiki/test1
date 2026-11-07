/**
 * Global transport shortcuts.
 *
 * One listener on the window rather than per-screen handlers, and it stays out
 * of the way whenever focus is in a field — a search box that pauses the book
 * on every space would be worse than no shortcut at all. The chords themselves
 * come from `keymap`, so the settings screen edits exactly what runs here.
 */
import { player } from './player.svelte';
import { ui } from './state.svelte';
import { keymap, type ActionId } from './keymap.svelte';
import { goBack } from './navigation';

const SKIP_SECONDS = 15;
const LONG_SKIP_SECONDS = SKIP_SECONDS * 6;
const VOLUME_STEP = 0.05;
const RATES = [0.75, 1, 1.25, 1.5, 1.75, 2];

function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return (
    tag === 'INPUT' ||
    tag === 'TEXTAREA' ||
    tag === 'SELECT' ||
    target.isContentEditable
  );
}

/** Space and Enter belong to the focused button; the browser already fires it. */
function isFocusedButton(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && target.tagName === 'BUTTON';
}

function stepRate(direction: 1 | -1): void {
  const at = RATES.findIndex(rate => rate >= player.rate - 0.001);
  const index = at === -1 ? RATES.indexOf(1) : at;
  const next = RATES[Math.min(Math.max(index + direction, 0), RATES.length - 1)];
  if (next !== undefined && next !== player.rate) void player.setRate(next);
}

/** Returns true when the action consumed the key (so the default is suppressed). */
function run(id: ActionId): boolean {
  switch (id) {
    case 'playPause':
      if (!player.item) return false;
      void player.toggle();
      return true;
    case 'seekBack':
      if (!player.item) return false;
      void player.skip(-SKIP_SECONDS);
      return true;
    case 'seekForward':
      if (!player.item) return false;
      void player.skip(SKIP_SECONDS);
      return true;
    case 'seekBackLong':
      if (!player.item) return false;
      void player.skip(-LONG_SKIP_SECONDS);
      return true;
    case 'seekForwardLong':
      if (!player.item) return false;
      void player.skip(LONG_SKIP_SECONDS);
      return true;
    case 'prevChapter':
      if (!player.item || !player.canStepBack) return false;
      void player.step(-1);
      return true;
    case 'nextChapter':
      if (!player.item || !player.canStepForward) return false;
      void player.step(1);
      return true;
    case 'volumeUp':
      void player.setVolume(Math.min(1, Math.round((player.volume + VOLUME_STEP) * 100) / 100));
      return true;
    case 'volumeDown':
      void player.setVolume(Math.max(0, Math.round((player.volume - VOLUME_STEP) * 100) / 100));
      return true;
    case 'mute':
      void player.setVolume(player.volume > 0 ? 0 : 1);
      return true;
    case 'speedUp':
      stepRate(1);
      return true;
    case 'speedDown':
      stepRate(-1);
      return true;
    case 'search':
      ui.route = 'library';
      player.collapse();
      ui.focusSearch += 1;
      return true;
    case 'settings':
      player.collapse();
      ui.route = 'settings';
      return true;
    case 'goBack':
      return goBack();
    default:
      return false;
  }
}

export function installShortcuts(): () => void {
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.defaultPrevented) return;

    const id = keymap.match(event);
    if (!id) return;

    if (isTyping(event.target) && !keymap.isGlobal(id)) return;
    if (isFocusedButton(event.target) && (event.code === 'Space' || event.code === 'Enter')) {
      return;
    }

    if (run(id)) event.preventDefault();
  };

  window.addEventListener('keydown', onKeyDown);
  return () => window.removeEventListener('keydown', onKeyDown);
}
