/**
 * Search that also works for Chinese libraries.
 *
 * A title like 《三体》 is unreachable by typing "santi" or "st" unless the
 * latin form is derived at match time. Deriving it costs a large dictionary, so
 * it is loaded on demand — when a search field is focused — and the first few
 * keystrokes simply match on literal text until it arrives.
 */
import type { LibraryItem } from './ipc';

type Convert = (text: string) => { full: string; initials: string };

interface Latin {
  full: string;
  initials: string;
}

const latinCache = new Map<string, Latin>();
const fieldCache = new Map<string, string>();

let convert: Convert | null = null;
let loading: Promise<void> | null = null;

const CJK = /[\u3400-\u9fff]/;

/** Warm the dictionary. Safe to call repeatedly; resolves once loaded. */
export function preloadPinyin(): Promise<void> {
  if (convert) return Promise.resolve();
  if (loading) return loading;

  loading = import('pinyin-pro')
    .then(mod => {
      const { pinyin } = mod;
      const clean = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, '');
      // Anything cached before the dictionary existed was a literal fallback.
      latinCache.clear();
      convert = (text: string) => ({
        full: clean(pinyin(text, { toneType: 'none', type: 'array' }).join('')),
        initials: clean(pinyin(text, { pattern: 'first', toneType: 'none', type: 'array' }).join('')),
      });
    })
    .catch(() => {
      // No dictionary: literal matching still works, which is better than
      // breaking search entirely.
    });

  return loading;
}

function latinForms(text: string): Latin {
  const hit = latinCache.get(text);
  if (hit) return hit;

  let value: Latin;
  if (!CJK.test(text)) {
    const compact = text.toLowerCase().replace(/[^a-z0-9]/g, '');
    value = { full: compact, initials: compact };
  } else if (convert) {
    value = convert(text);
  } else {
    // Dictionary not here yet — fall back to the literal text so the query is
    // not silently swallowed while the chunk is in flight.
    value = { full: text.toLowerCase(), initials: text.toLowerCase() };
  }

  latinCache.set(text, value);
  return value;
}

/** Substring match against the text, its pinyin, or its pinyin initials. */
export function textMatches(text: string, query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  if (text.toLowerCase().includes(needle)) return true;

  const compact = needle.replace(/\s+/g, '');
  if (!compact) return true;
  const { full, initials } = latinForms(text);
  return full.includes(compact) || initials.includes(compact);
}

/** The searchable fields of a library item, joined once per id. */
export function itemFields(item: LibraryItem): string {
  const hit = fieldCache.get(item.id);
  if (hit !== undefined) return hit;

  const meta = item.media?.metadata;
  const joined = [
    meta?.title,
    meta?.subtitle,
    meta?.authorName,
    meta?.seriesName,
    meta?.narratorName,
  ]
    .filter(Boolean)
    .join(' ');
  fieldCache.set(item.id, joined);
  return joined;
}

export function matchesQuery(item: LibraryItem, query: string): boolean {
  return matchScore(item, query) > 0;
}

/**
 * Ranked, multi-word search. Every word must hit something (AND), and a title
 * hit outranks an author hit, which outranks a series or narrator hit. Prefix
 * and exact matches score higher than a bare substring, so typing a few
 * letters puts the book you meant at the top instead of somewhere in a list.
 */
export function matchScore(item: LibraryItem, query: string): number {
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return 1;

  const meta = item.media?.metadata;
  const fields: [string | undefined, number][] = [
    [meta?.title, 10],
    [meta?.authorName, 6],
    [meta?.seriesName, 5],
    [meta?.subtitle, 4],
    [meta?.narratorName, 4],
  ];

  let total = 0;
  for (const word of words) {
    let best = 0;
    for (const [text, weight] of fields) {
      if (!text || !textMatches(text, word)) continue;
      const lower = text.toLowerCase();
      const quality = lower === word ? 2 : lower.startsWith(word) ? 1.5 : 1;
      best = Math.max(best, weight * quality);
    }
    // One word with no hit anywhere disqualifies the item.
    if (best === 0) return 0;
    total += best;
  }
  return total;
}
