/**
 * Editable keyboard map.
 *
 * One table drives three things: the global listener, the settings screen and
 * "restore defaults". Bindings are keyed by `event.code`, so they do not move
 * when the user switches keyboard layout, and only the differences from the
 * defaults are written to storage — a future release can add an action without
 * leaving stale keys behind.
 */
import type { TranslationKey } from './i18n.svelte';

export type ActionId =
  | 'playPause'
  | 'seekBack'
  | 'seekForward'
  | 'seekBackLong'
  | 'seekForwardLong'
  | 'prevChapter'
  | 'nextChapter'
  | 'volumeUp'
  | 'volumeDown'
  | 'mute'
  | 'speedDown'
  | 'speedUp'
  | 'search'
  | 'settings'
  | 'collapse';

export interface Binding {
  code: string;
  ctrl: boolean;
  shift: boolean;
  alt: boolean;
}

export interface ActionDef {
  id: ActionId;
  label: TranslationKey;
  group: 'playback' | 'navigation';
  defaults: Binding[];
  /** Chords keep working while a text field has focus. */
  global?: boolean;
}

function chord(code: string, mods: Partial<Omit<Binding, 'code'>> = {}): Binding {
  return {
    code,
    ctrl: mods.ctrl ?? false,
    shift: mods.shift ?? false,
    alt: mods.alt ?? false,
  };
}

export const ACTIONS: ActionDef[] = [
  { id: 'playPause', label: 'keys.playPause', group: 'playback', defaults: [chord('Space'), chord('KeyK')] },
  { id: 'seekBack', label: 'keys.seekBack', group: 'playback', defaults: [chord('ArrowLeft')] },
  { id: 'seekForward', label: 'keys.seekForward', group: 'playback', defaults: [chord('ArrowRight')] },
  { id: 'seekBackLong', label: 'keys.seekLong', group: 'playback', defaults: [chord('ArrowLeft', { shift: true })] },
  { id: 'seekForwardLong', label: 'keys.seekLong', group: 'playback', defaults: [chord('ArrowRight', { shift: true })] },
  { id: 'prevChapter', label: 'keys.prevChapter', group: 'playback', defaults: [chord('BracketLeft'), chord('KeyP')] },
  { id: 'nextChapter', label: 'keys.nextChapter', group: 'playback', defaults: [chord('BracketRight'), chord('KeyN')] },
  { id: 'volumeDown', label: 'keys.volumeDown', group: 'playback', defaults: [chord('ArrowDown')] },
  { id: 'volumeUp', label: 'keys.volumeUp', group: 'playback', defaults: [chord('ArrowUp')] },
  { id: 'mute', label: 'keys.mute', group: 'playback', defaults: [chord('KeyM')] },
  { id: 'speedDown', label: 'keys.speedDown', group: 'playback', defaults: [chord('Minus')] },
  { id: 'speedUp', label: 'keys.speedUp', group: 'playback', defaults: [chord('Equal')] },
  { id: 'search', label: 'keys.search', group: 'navigation', defaults: [chord('KeyF', { ctrl: true })], global: true },
  { id: 'settings', label: 'keys.settings', group: 'navigation', defaults: [chord('Comma', { ctrl: true })], global: true },
  { id: 'collapse', label: 'keys.escape', group: 'navigation', defaults: [chord('Escape')] },
];

const STORAGE_KEY = 'skald.keymap';

const KEY_LABEL: Record<string, string> = {
  Space: 'Space',
  ArrowLeft: '←',
  ArrowRight: '→',
  ArrowUp: '↑',
  ArrowDown: '↓',
  BracketLeft: '[',
  BracketRight: ']',
  Comma: ',',
  Period: '.',
  Slash: '/',
  Equal: '=',
  Minus: '-',
  Escape: 'Esc',
  Enter: 'Enter',
  Backspace: 'Backspace',
  NumpadAdd: 'Num +',
  NumpadSubtract: 'Num -',
};

export function keyLabel(code: string): string {
  if (KEY_LABEL[code]) return KEY_LABEL[code];
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  if (code.startsWith('Numpad')) return `Num ${code.slice(6)}`;
  return code || '—';
}

export function bindingLabel(binding: Binding): string {
  const parts: string[] = [];
  if (binding.ctrl) parts.push('Ctrl');
  if (binding.alt) parts.push('Alt');
  if (binding.shift) parts.push('Shift');
  parts.push(keyLabel(binding.code));
  return parts.join(' + ');
}

export function sameChord(a: Binding, b: Binding): boolean {
  return a.code === b.code && a.ctrl === b.ctrl && a.shift === b.shift && a.alt === b.alt;
}

/** A chord made from a live event; modifier-only presses are rejected. */
export function bindingFromEvent(event: KeyboardEvent): Binding | null {
  const modifierOnly = ['Control', 'Shift', 'Alt', 'Meta', 'CapsLock', 'OS'];
  if (modifierOnly.includes(event.key) || !event.code) return null;
  return {
    code: event.code,
    ctrl: event.ctrlKey || event.metaKey,
    shift: event.shiftKey,
    alt: event.altKey,
  };
}

function load(): Record<string, Binding[]> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return {};
    const out: Record<string, Binding[]> = {};
    for (const [id, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (!Array.isArray(value)) continue;
      const bindings = value.filter((entry): entry is Binding => {
        if (!entry || typeof entry !== 'object') return false;
        const candidate = entry as Partial<Binding>;
        return typeof candidate.code === 'string' && candidate.code.length > 0;
      }).map(entry => ({
        code: entry.code,
        ctrl: Boolean(entry.ctrl),
        shift: Boolean(entry.shift),
        alt: Boolean(entry.alt),
      }));
      if (bindings.length > 0) out[id] = bindings;
    }
    return out;
  } catch {
    return {};
  }
}

class KeymapStore {
  /** Only actions the user changed are stored here. */
  overrides = $state<Record<string, Binding[]>>(load());

  private persist(): void {
    if (Object.keys(this.overrides).length === 0) {
      localStorage.removeItem(STORAGE_KEY);
      return;
    }
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.overrides));
    } catch {
      // Storage full or blocked: the session still works, only persistence is lost.
    }
  }

  bindingsOf(id: ActionId): Binding[] {
    return this.overrides[id] ?? ACTIONS.find(action => action.id === id)?.defaults ?? [];
  }

  isCustom(id: ActionId): boolean {
    return id in this.overrides;
  }

  /** The first action already using this chord, ignoring `skip`. */
  conflict(binding: Binding, skip: ActionId): ActionId | null {
    for (const action of ACTIONS) {
      if (action.id === skip) continue;
      if (this.bindingsOf(action.id).some(existing => sameChord(existing, binding))) {
        return action.id;
      }
    }
    return null;
  }

  set(id: ActionId, bindings: Binding[]): void {
    this.overrides = { ...this.overrides, [id]: bindings };
    this.persist();
  }

  add(id: ActionId, binding: Binding): void {
    const current = this.bindingsOf(id);
    if (current.some(existing => sameChord(existing, binding))) return;
    this.set(id, [...current, binding]);
  }

  remove(id: ActionId, binding: Binding): void {
    const next = this.bindingsOf(id).filter(existing => !sameChord(existing, binding));
    this.set(id, next);
  }

  replace(id: ActionId, index: number, binding: Binding): void {
    const next = [...this.bindingsOf(id)];
    next[index] = binding;
    this.set(id, next);
  }

  reset(id: ActionId): void {
    const next = { ...this.overrides };
    delete next[id];
    this.overrides = next;
    this.persist();
  }

  resetAll(): void {
    this.overrides = {};
    this.persist();
  }

  /** Action bound to this keystroke, if any. */
  match(event: KeyboardEvent): ActionId | null {
    if (!event.code) return null;
    const pressed: Binding = {
      code: event.code,
      ctrl: event.ctrlKey || event.metaKey,
      shift: event.shiftKey,
      alt: event.altKey,
    };
    for (const action of ACTIONS) {
      if (this.bindingsOf(action.id).some(binding => sameChord(binding, pressed))) {
        return action.id;
      }
    }
    return null;
  }

  /** Whether a matched action may fire while focus is inside a text field. */
  isGlobal(id: ActionId): boolean {
    return ACTIONS.find(action => action.id === id)?.global ?? false;
  }
}

export const keymap = new KeymapStore();
