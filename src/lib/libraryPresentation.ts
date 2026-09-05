import type { Library } from '../api/abs';

/** Human-readable name used wherever a library is selected. */
export function libraryDisplayLabel(library: Pick<Library, 'name' | 'mediaType'>): string {
  return library.mediaType === 'podcast' ? `播客：${library.name}` : library.name;
}

/** Text badge that makes the library's storage source explicit. */
export function librarySourceBadge(library: Pick<Library, 'mediaType' | 'source'>): string {
  if (library.source === 'all') return '合并';
  const source = library.source === 'local' ? '这台电脑' : '服务器';
  return library.mediaType === 'podcast' ? `${source}播客` : source;
}
