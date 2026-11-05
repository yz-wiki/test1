/**
 * Local artwork overrides — book covers, author portraits, series art.
 *
 * ## Why this is local, and where ABS stops
 *
 * Audiobookshelf stores a cover per *library item* (`/api/items/{id}/cover`,
 * admin/update permission required) and, from 2.6 on, an optional image per
 * *author* (`/api/authors/{id}`). Our library payload only carries
 * `metadata.authorName` as a plain string — there is no author id to address,
 * and no series image concept at all. Writing an author portrait back would
 * mean guessing an id from a display name, which can silently attach a photo
 * to the wrong person. Server-side cover writes also need permissions the
 * player does not assume.
 *
 * So artwork management lives here as a local, per-install override layer:
 * it is instant, reversible, works offline, and never claims to have changed
 * server data. `Cover.svelte` prefers the override and falls back to the
 * server cover / initial letter.
 *
 * Uploaded files are downscaled to 512 px WebP before persistence, so a
 * phone photo does not blow the ~5 MB localStorage budget. A data URL is used
 * instead of copying files into app data because it needs no new Rust command
 * and survives a portable install being moved to another machine.
 */
export type ArtKind = 'book' | 'author' | 'series';

const KEY = 'skald.artwork';
const MAX_EDGE = 512;

type Overrides = Record<string, string>;

function read(): Overrides {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Overrides) : {};
  } catch {
    return {};
  }
}

function key(kind: ArtKind, id: string): string {
  return `${kind}:${id}`;
}

/** Shrink and re-encode a picked image file into a compact data URL. */
function shrink(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      try {
        const scale = Math.min(1, MAX_EDGE / Math.max(image.width, image.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(image.width * scale));
        canvas.height = Math.max(1, Math.round(image.height * scale));
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('canvas unavailable');
        ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
        // WebP keeps a 512 px cover around 20–60 KB; JPEG is the fallback for
        // older WebView builds.
        const out = canvas.toDataURL('image/webp', 0.82);
        resolve(out.startsWith('data:image/webp') ? out : canvas.toDataURL('image/jpeg', 0.85));
      } catch (error) {
        reject(error);
      } finally {
        URL.revokeObjectURL(url);
      }
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('image decode failed'));
    };
    image.src = url;
  });
}

class ArtworkStore {
  overrides = $state<Overrides>(read());

  get(kind: ArtKind, id: string): string | null {
    return this.overrides[key(kind, id)] ?? null;
  }

  has(kind: ArtKind, id: string): boolean {
    return Boolean(this.overrides[key(kind, id)]);
  }

  private persist(next: Overrides): boolean {
    try {
      localStorage.setItem(KEY, JSON.stringify(next));
      this.overrides = next;
      return true;
    } catch {
      // Quota exceeded: keep the previous state intact and let the caller
      // show a hint instead of half-writing the map.
      return false;
    }
  }

  set(kind: ArtKind, id: string, dataUrl: string): boolean {
    return this.persist({ ...this.overrides, [key(kind, id)]: dataUrl });
  }

  clear(kind: ArtKind, id: string): void {
    const next = { ...this.overrides };
    delete next[key(kind, id)];
    void this.persist(next);
  }

  /**
   * The most direct setting available: an OS file picker from the webview, no
   * backend round-trip, no dialog component. Returns a short result the caller
   * can surface in its own toast.
   */
  choose(kind: ArtKind, id: string): Promise<'ok' | 'cancelled' | 'error'> {
    return new Promise(resolve => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/png,image/jpeg,image/webp,image/avif,image/gif';
      input.style.display = 'none';
      document.body.appendChild(input);

      const finish = (result: 'ok' | 'cancelled' | 'error') => {
        input.remove();
        resolve(result);
      };

      input.addEventListener('change', () => {
        const file = input.files?.[0];
        if (!file) return finish('cancelled');
        void shrink(file)
          .then(dataUrl => finish(this.set(kind, id, dataUrl) ? 'ok' : 'error'))
          .catch(() => finish('error'));
      });
      // Chromium does not reliably fire `cancel`; a focus return with no
      // selection is the portable signal that the picker was dismissed.
      window.addEventListener(
        'focus',
        () => {
          setTimeout(() => {
            if (document.body.contains(input) && !input.files?.length) finish('cancelled');
          }, 350);
        },
        { once: true },
      );
      input.click();
    });
  }
}

export const artwork = new ArtworkStore();
