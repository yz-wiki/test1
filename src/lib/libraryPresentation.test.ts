import { describe, expect, it } from 'vitest';
import { libraryDisplayLabel, librarySourceBadge } from './libraryPresentation';

describe('library presentation', () => {
  it('distinguishes server and local audiobook libraries', () => {
    expect(librarySourceBadge({ mediaType: 'book', source: undefined })).toBe('服务器');
    expect(librarySourceBadge({ mediaType: 'book', source: 'local' })).toBe('这台电脑');
  });

  it('keeps podcast context in the name and source badge', () => {
    const podcast = { name: 'News', mediaType: 'podcast', source: 'local' };
    expect(libraryDisplayLabel(podcast)).toBe('播客：News');
    expect(librarySourceBadge(podcast)).toBe('这台电脑播客');
  });
});
