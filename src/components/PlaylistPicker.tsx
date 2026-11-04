import { useState, useEffect, useRef } from 'react';
import { useI18n } from '../i18n';
import type { CSSProperties } from 'react';
import ReactDOM from 'react-dom';
import type { LibraryItem } from '../state/onyx';
import { getPlaylists, createPlaylist, batchAddToPlaylist } from '../api/abs';
import type { Playlist, PodcastEpisode } from '../api/abs';
import Icon from './Icon';
import { useModalFocus } from '../hooks/useModalFocus';
import { errorMessage } from '../lib/presentError';
import { log } from '../lib/log';

// One family for interface text; monospace is opt-in via .ui-tech.
const UI_STACK = 'var(--font-ui)';

const MONO = UI_STACK;
const SERIF = UI_STACK;
const footBtn: CSSProperties = {
  width: '100%', fontFamily: MONO, fontSize: 'var(--fs-0)', letterSpacing: '0.1em', textTransform: 'uppercase',
  padding: 'var(--s-3) var(--s-4)', borderRadius: 'var(--r-md)', cursor: 'pointer', lineHeight: 1, background: 'transparent',
};

export interface PlaylistPickerProps {
  item: LibraryItem;
  /** When set, the picker adds this podcast EPISODE (item = its parent podcast)
   *  instead of the whole item — ABS playlist entries carry an episodeId. */
  episode?: PodcastEpisode | null;
  serverUrl: string;
  onClose: () => void;
}

export default function PlaylistPicker({ item, episode, serverUrl, onClose }: PlaylistPickerProps) {
  const { t } = useI18n();
  const [playlists, setPlaylists] = useState<Playlist[] | null>(null);
  const [adding, setAdding] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [newMode, setNewMode] = useState(false);
  const [newName, setNewName] = useState('');
  const [creating, setCreating] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const dialogRef = useModalFocus<HTMLDivElement>(onClose, !adding && !creating);

  useEffect(() => {
    getPlaylists(serverUrl, item.libraryId)
      .then(setPlaylists)
      .catch(e => { log.warn('library', 'playlist list failed', { err: String(e) }); setError(errorMessage(e, { operation: 'refresh' })); });
  }, [serverUrl, item.libraryId]);

  useEffect(() => {
    if (newMode) inputRef.current?.focus();
  }, [newMode]);

  // Episode adds carry the episodeId alongside the parent podcast's item id.
  const entry = episode?.id ? { libraryItemId: item.id, episodeId: episode.id } : { libraryItemId: item.id };

  async function handleAdd(playlist: Playlist) {
    setAdding(playlist.id);
    try {
      await batchAddToPlaylist(serverUrl, playlist.id, [entry]);
      onClose();
    } catch (e) {
      log.warn('library', 'playlist add failed', { playlistId: playlist.id, err: String(e) });
      setError(errorMessage(e, { operation: 'save' }));
      setAdding(null);
    }
  }

  async function handleCreate() {
    const name = newName.trim();
    if (!name) return;
    setCreating(true);
    try {
      // Create the playlist with the item pre-populated — one round-trip instead of two.
      await createPlaylist(serverUrl, item.libraryId, name, null, [entry]);
      onClose();
    } catch (e) {
      log.warn('library', 'playlist create failed', { err: String(e) });
      setError(errorMessage(e, { operation: 'save' }));
      setCreating(false);
    }
  }

  function onNewKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter') { void handleCreate(); }
    if (e.key === 'Escape') { setNewMode(false); setNewName(''); }
  }

  const modal = (
    <div
      className="ui-scrim"  style={{ zIndex: 2000 }}
      onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="playlist-picker-title" style={{
        width: 360, maxHeight: '70vh',
        background: 'var(--surface-overlay)', border: '1px solid var(--onyx-glass-edge)',
        borderRadius: 'var(--r-overlay)',
        boxShadow: 'var(--shadow-dialog)',
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
      }}>
        {/* Header */}
        <div style={{ flexShrink: 0, padding: 'var(--s-5) var(--s-5) 0 var(--s-6)', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 'var(--s-4)' }}>
          <div style={{ minWidth: 0 }}>
            <div id="playlist-picker-title" style={{ fontFamily: SERIF, fontSize: 19, fontWeight: 500, letterSpacing: '-0.015em', lineHeight: 1.1 }}>{t('playlistPicker.title')}</div>
            <div style={{ fontFamily: MONO, fontSize: 'var(--fs-0)', color: 'var(--onyx-text-mute)', letterSpacing: '0.06em', marginTop: 'var(--s-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {episode ? `Episode — ${episode.title}` : 'Choose a playlist for this book'}
            </div>
          </div>
          <button onClick={onClose} style={{ width: 28, height: 28, borderRadius: 'var(--r-sm)', background: 'none', border: '1px solid transparent', color: 'var(--onyx-text-mute)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 'var(--fs-4)', lineHeight: 1, flexShrink: 0, marginTop: '2px' }}>✕</button>
        </div>
        <div style={{ flexShrink: 0, height: 1, background: 'var(--onyx-line)', margin: 'var(--s-4) 0 0' }} />

        {/* Playlist list */}
        <div style={{ flex: 1, overflowY: 'auto', padding: 'var(--s-2) 0' }}>
          {playlists === null && !error && (
            <div style={{ padding: 'var(--s-4) var(--s-6)', fontFamily: MONO, fontSize: 'var(--fs-1)', color: 'var(--onyx-text-mute)', letterSpacing: '0.06em' }}>Loading…</div>
          )}
          {error && (
            <div style={{ padding: 'var(--s-3) var(--s-6)', fontSize: 'var(--fs-2)', color: '#e8716a', fontFamily: MONO }}>{error}</div>
          )}
          {playlists !== null && playlists.length === 0 && (
            <div style={{ padding: 'var(--s-3) var(--s-6)', fontFamily: MONO, fontSize: 'var(--fs-1)', color: 'var(--onyx-text-mute)', letterSpacing: '0.04em' }}>No playlists yet — create one below.</div>
          )}
          {playlists?.map(pl => {
            const rowBusy = adding === pl.id;
            return (
              <button
                key={pl.id}
                disabled={adding !== null || creating}
                onClick={() => { void handleAdd(pl); }}
                style={{
                  display: 'flex', alignItems: 'center', gap: 'var(--s-3)', width: '100%', padding: 'var(--s-3) var(--s-5) var(--s-3) var(--s-5)',
                  background: rowBusy ? 'var(--onyx-accent-dim)' : 'transparent',
                  border: 'none', borderLeft: `2px solid ${rowBusy ? 'var(--onyx-accent)' : 'transparent'}`,
                  color: rowBusy ? 'var(--onyx-accent)' : 'var(--onyx-text)',
                  fontSize: 'var(--fs-4)', textAlign: 'left', fontFamily: 'inherit',
                  cursor: (adding !== null || creating) ? 'default' : 'pointer',
                  opacity: rowBusy ? 0.6 : 1, transition: 'background 0.1s, color 0.1s',
                }}
              >
                <Icon name="playlist" size={15} color={rowBusy ? 'var(--onyx-accent)' : 'var(--onyx-text-mute)'} />
                <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {rowBusy ? 'Adding…' : pl.name}
                </span>
                {/* Membership indicator — always checked since adding closes */}
                <span style={{
                  width: 18, height: 18, borderRadius: 'var(--r-xs)', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: 'transparent',
                  border: `1px solid ${rowBusy ? 'var(--onyx-accent)' : 'var(--onyx-glass-edge)'}`,
                  color: 'var(--onyx-bg)',
                }} />
              </button>
            );
          })}
        </div>

        {/* Footer */}
        <div style={{ flexShrink: 0, padding: 'var(--s-3) var(--s-4) var(--s-4)', borderTop: '1px solid var(--onyx-line)', display: 'flex', flexDirection: 'column', gap: 'var(--s-2)' }}>
          {newMode ? (
            <div style={{ display: 'flex', gap: 'var(--s-2)' }}>
              <input
                ref={inputRef}
                type="text"
                value={newName}
                onChange={e => setNewName(e.target.value)}
                onKeyDown={onNewKeyDown}
                placeholder={t('playlistPicker.namePlaceholder')}
                disabled={creating}
                onFocus={e => { e.currentTarget.style.borderColor = 'var(--onyx-accent-edge)'; }}
                onBlur={e => { e.currentTarget.style.borderColor = 'var(--onyx-glass-edge)'; }}
                style={{ flex: 1, padding: 'var(--s-3) var(--s-3)', background: 'var(--onyx-bg-deep)', border: '1px solid var(--onyx-glass-edge)', borderRadius: 'var(--r-md)', color: 'var(--onyx-text)', fontFamily: 'inherit', fontSize: 'var(--fs-3)', outline: 'none', transition: 'border-color 0.15s' }}
              />
              <button
                onClick={handleCreate}
                disabled={!newName.trim() || creating}
                style={{ ...footBtn, width: 'auto', whiteSpace: 'nowrap', border: '1px solid transparent', fontWeight: 600, background: newName.trim() && !creating ? 'var(--onyx-accent)' : 'var(--onyx-accent-dim)', color: newName.trim() && !creating ? 'var(--onyx-bg)' : 'var(--onyx-text-mute)', cursor: newName.trim() && !creating ? 'pointer' : 'default' }}
              >
                {creating ? 'Creating…' : 'Create'}
              </button>
            </div>
          ) : (
            <button
              onClick={() => setNewMode(true)}
              disabled={adding !== null}
              style={{ ...footBtn, border: '1px dashed var(--onyx-accent-edge)', color: 'var(--onyx-accent)' }}
            >
              + New Playlist
            </button>
          )}

          <button
            onClick={onClose}
            style={{ ...footBtn, border: '1px solid var(--onyx-glass-edge)', color: 'var(--onyx-text-dim)' }}
          >
            {t('playlistPicker.cancel')}
          </button>
        </div>
      </div>
    </div>
  );

  return ReactDOM.createPortal(modal, document.body);
}
