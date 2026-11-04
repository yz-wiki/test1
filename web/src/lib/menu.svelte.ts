/**
 * One context menu for the whole window.
 *
 * The webview's own menu (Back, Reload, Save as…) belongs to a browser, not to
 * an audio player, so it is suppressed and replaced by this. A single store
 * keeps only one menu alive at a time and lets any screen open it with its own
 * items.
 */
export interface MenuItem {
  id: string;
  label: string;
  hint?: string;
  danger?: boolean;
  disabled?: boolean;
  separatorBefore?: boolean;
  action: () => void;
}

class MenuStore {
  open = $state(false);
  x = $state(0);
  y = $state(0);
  items = $state<MenuItem[]>([]);

  show(event: MouseEvent, items: MenuItem[]): void {
    if (items.length === 0) return;
    event.preventDefault();
    event.stopPropagation();

    // Keep the menu inside the window: measure nothing, but reserve a generous
    // box so it never opens off the right or bottom edge.
    const width = 220;
    const height = Math.min(items.length * 30 + 16, 360);
    this.x = Math.min(event.clientX, window.innerWidth - width - 8);
    this.y = Math.min(event.clientY, window.innerHeight - height - 8);
    this.items = items;
    this.open = true;
  }

  hide(): void {
    this.open = false;
    this.items = [];
  }

  run(item: MenuItem): void {
    if (item.disabled) return;
    this.hide();
    item.action();
  }
}

export const menu = new MenuStore();
