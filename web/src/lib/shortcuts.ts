/**
 * Global transport shortcuts.
 *
 * One listener on the window rather than per-screen handlers, and it stays out
 * of the way whenever focus is in a field — a search box that pauses the book
 * on every space would be worse than no shortcut at all.
 */
import { player } from './player.svelte';
import { ui } from './state.svelte';

const SKIP_SECONDS = 15;

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

export function installShortcuts(): () => void {
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.defaultPrevented) return;

    // The two window-level chords work even from inside a field.
    if ((event.ctrlKey || event.metaKey) && !event.altKey) {
      if (event.key === 'f') {
        event.preventDefault();
        ui.route = 'library';
        player.collapse();
        ui.focusSearch += 1;
        return;
      }
      if (event.key === ',') {
        event.preventDefault();
        player.collapse();
        ui.route = 'settings';
        return;
      }
      return;
    }

    if (isTyping(event.target)) return;
    if (event.altKey) return;

    switch (event.key) {
      case ' ':
      case 'k':
        if (!player.item) return;
        event.preventDefault();
        void player.toggle();
        break;
      case 'ArrowRight':
        if (!player.item) return;
        event.preventDefault();
        void player.skip(event.shiftKey ? SKIP_SECONDS * 6 : SKIP_SECONDS);
        break;
      case 'ArrowLeft':
        if (!player.item) return;
        event.preventDefault();
        void player.skip(event.shiftKey ? -SKIP_SECONDS * 6 : -SKIP_SECONDS);
        break;
      case ']':
      case 'n':
        if (!player.item) return;
        event.preventDefault();
        void player.step(1);
        break;
      case '[':
      case 'p':
        if (!player.item) return;
        event.preventDefault();
        void player.step(-1);
        break;
      case 'Escape':
        if (player.expanded) {
          event.preventDefault();
          player.collapse();
        }
        break;
      default:
        break;
    }
  };

  window.addEventListener('keydown', onKeyDown);
  return () => window.removeEventListener('keydown', onKeyDown);
}
