/**
 * Local favourites.
 *
 * Audiobookshelf has no favourite flag on a library item — there is no field
 * to write to and inventing one server-side would mean a fork. These are
 * therefore kept on this machine, per item id, and the UI says so: the button
 * is a bookmark, not a server-side "like".
 */
class Favorites {
  ids = $state<Set<string>>(load());

  has(id: string | null | undefined): boolean {
    return id ? this.ids.has(id) : false;
  }

  toggle(id: string): void {
    const next = new Set(this.ids);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    this.ids = next;
    try {
      localStorage.setItem('skald.favorites', JSON.stringify([...next]));
    } catch {
      // A full or blocked store only costs the star its memory.
    }
  }
}

function load(): Set<string> {
  try {
    const raw = localStorage.getItem('skald.favorites');
    if (!raw) return new Set();
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? new Set(parsed.filter((id): id is string => typeof id === 'string')) : new Set();
  } catch {
    return new Set();
  }
}

export const favorites = new Favorites();
