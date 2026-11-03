import type { OnyxState, LibraryItem } from '../../../state/onyx';
import { groupMatchesFilter } from '../../../lib/shelfFilters';
import { bookTitle, bookAuthor, bookGenre, bookDurSecs } from '../../../state/onyx';
import BrowseView, { seriesTotalDur } from '../BrowseView';
import BrowseList from '../BrowseList';
import BrowseTile from '../BrowseTile';
import Initial from '../Initial';
import { useI18n } from '../../../i18n';

// One family for interface text; monospace is opt-in via .ui-tech.
const UI_STACK = 'var(--font-ui)';

const SERIF = UI_STACK;
const MONO = UI_STACK;

interface AuthorGroup {
  name: string;
  books: LibraryItem[];
}


export interface AuthorsViewProps {
  st: OnyxState;
  inline?: boolean;
}

export default function AuthorsView({ st, inline = false }: AuthorsViewProps) {
  const { t } = useI18n();
  const groups: Record<string, LibraryItem[]> = {};
  for (const b of st.library) {
    const author = bookAuthor(b);
    if (!groups[author]) groups[author] = [];
    groups[author].push(b);
  }

  let list: AuthorGroup[] = Object.entries(groups)
    .map(([name, books]) => ({ name, books }))
    .sort((a, b) => a.name.localeCompare(b.name));

  if (st.search) {
    const q = st.search.toLowerCase();
    list = list.filter(a =>
      a.name.toLowerCase().includes(q) ||
      a.books.some(b => bookTitle(b).toLowerCase().includes(q))
    );
  }

  if (st.filter !== 'all') {
    list = list.filter(a => groupMatchesFilter(a.books, st.filter, st.mediaProgress));
  }

  const open = (name: string) => {
    st.setContextFilter({ kind: 'author', value: name });
    st.setShelfTab('library');
    st.setScreen('library');
  };

  return (
    <BrowseView st={st} title={t('browse.authors')} subtitle={t('browse.authorsSubtitle', { count: list.length })} showModeToggle inline={inline}>
      {st.libraryView === 'grid' ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 22 }}>
          {list.map(a => {
            const genres = [...new Set(a.books.map(b => bookGenre(b)).filter(Boolean))];
            return (
              <BrowseTile
                key={a.name}
                mode={st.browseTileStyle}
                tag="Author"
                title={a.name}
                subtitle={genres.join(' · ') || '—'}
                stat={`${a.books.length} TITLE${a.books.length === 1 ? '' : 'S'} · ${seriesTotalDur(a.books)}`}
                books={a.books}
                serverUrl={st.serverUrl}
                onClick={() => open(a.name)}
              />
            );
          })}
        </div>
      ) : (
        <BrowseList
          columns={[
            { id: 'name',   label: 'Author',   flex: 2   },
            { id: 'titles', label: 'Titles',   width: 80 },
            { id: 'dur',    label: 'Duration', width: 110 },
          ]}
          rows={list.map(a => ({
            key: a.name,
            onClick: () => open(a.name),
            leading: <Initial name={a.name} small />,
            sort: {
              name:   a.name,
              titles: a.books.length,
              dur:    a.books.reduce((acc, b) => acc + bookDurSecs(b), 0),
            },
            cells: {
              name:   <div style={{ fontFamily: SERIF, fontSize: 14, fontWeight: 500 }}>{a.name}</div>,
              titles: <div style={{ fontFamily: MONO, fontSize: 11, color: 'var(--onyx-text-mute)' }}>{a.books.length}</div>,
              dur:    <div style={{ fontFamily: MONO, fontSize: 11, color: 'var(--onyx-text-mute)' }}>{seriesTotalDur(a.books)}</div>,
            },
          }))}
        />
      )}
    </BrowseView>
  );
}
