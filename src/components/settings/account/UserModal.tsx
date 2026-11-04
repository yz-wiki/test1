// Admin create/edit user modal, including the access-control (permissions)
// editor from cluster H.
// Moved verbatim out of AccountSection.tsx (God-File Decomposition roadmap, L3/L7).
import { useState } from 'react';
import { useI18n } from '../../../i18n';
import { SERIF, MONO, Pill } from '../shared';
import type { AdminUser, UserPermissions } from '../../../api/abs';
import { useModalFocus } from '../../../hooks/useModalFocus';
import { errorMessage } from '../../../lib/presentError';
import { log } from '../../../lib/log';

interface UserModalProps {
  /** "Add User" or "Edit User" — shown as the modal title. */
  title: string;
  /** Pre-fill the username input when editing an existing account. */
  initialUsername?: string;
  /** Pre-select the type pill when editing. "root" is clamped to "admin". */
  initialType?: string;
  /** When true, the password field shows a "leave blank to keep" hint. */
  isEdit?: boolean;
  /** Full user (with permissions) when editing — drives the access-control editor. */
  editUser?: AdminUser;
  /** Libraries available to assign (cluster H). */
  libraries?: Array<{ id: string; name: string }>;
  /** Tags available to assign (derived from the loaded library). */
  availableTags?: string[];
  /** Called with the validated field values, email, the enable flag, and the full
   *  permissions blob. Should throw on server errors. */
  onSubmit: (username: string, password: string, type: 'user' | 'admin', email: string, enable: boolean, permissions: UserPermissions) => Promise<void>;
  onCancel: () => void;
}

/** A pill switch used inside the UserModal form. Sets type="button" so toggling
 *  a permission never submits the surrounding <form>. */
function PermToggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!on)}
      role="switch"
      aria-checked={on}
      style={{
        width: 36, height: 20, borderRadius: 'var(--r-card)', padding: '0', flexShrink: 0,
        background: on ? 'var(--onyx-accent)' : 'rgba(255,255,255,0.12)',
        border: 'none', cursor: 'pointer', position: 'relative', transition: 'background 0.15s',
      }}
    >
      <div style={{
        position: 'absolute', top: 2, left: on ? 18 : 2, width: 16, height: 16, borderRadius: 'var(--r-md)',
        background: on ? 'var(--onyx-bg)' : 'var(--onyx-text)', transition: 'left 0.15s',
      }} />
    </button>
  );
}

/** A labelled permission row: name on the left, toggle on the right. */
function PermRow({ label, on, onChange }: { label: string; on: boolean; onChange: (v: boolean) => void }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--s-3)' }}>
      <span style={{ fontSize: 'var(--fs-2)', color: 'var(--onyx-text)' }}>{label}</span>
      <PermToggle on={on} onChange={onChange} />
    </div>
  );
}

/** Glass-panel modal for creating or editing a user account. */
export default function UserModal({
  title,
  initialUsername = '',
  initialType = 'user',
  isEdit = false,
  editUser,
  libraries = [],
  availableTags = [],
  onSubmit,
  onCancel,
}: UserModalProps) {
  const { t } = useI18n();
  const [username, setUsername] = useState(initialUsername);
  const [password, setPassword] = useState('');
  // Clamp to 'admin' or 'user'; 'root' cannot be assigned through the UI.
  const [userType, setUserType] = useState<'user' | 'admin'>(
    initialType === 'admin' || initialType === 'root' ? 'admin' : 'user',
  );
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const dialogRef = useModalFocus<HTMLFormElement>(onCancel, !pending);

  // Email + the account-enable flag (both add and edit).
  const [email, setEmail] = useState(editUser?.email ?? '');
  const [enable, setEnable] = useState(editUser?.isActive ?? true);

  // ── Permissions state — seeded from the user when editing, else ABS defaults
  // (only download + access-all-libraries/tags default on). Shown in both add and
  // edit so a new account can be fully configured at creation time. ──
  const seed = editUser?.permissions;
  const seedLibs = editUser?.librariesAccessible ?? seed?.librariesAccessible ?? [];
  const seedTags = editUser?.itemTagsSelected ?? seed?.itemTagsSelected ?? [];
  const [canDownload, setCanDownload] = useState(seed?.download ?? true);
  const [canUpdate, setCanUpdate] = useState(seed?.update ?? false);
  const [canDelete, setCanDelete] = useState(seed?.delete ?? false);
  const [canUpload, setCanUpload] = useState(seed?.upload ?? false);
  const [canCreateEreader, setCanCreateEreader] = useState(seed?.createEreader ?? false);
  const [accessAllLibraries, setAccessAllLibraries] = useState(seed?.accessAllLibraries ?? true);
  const [librariesAccessible, setLibrariesAccessible] = useState<string[]>(seedLibs);
  const [accessAllTags, setAccessAllTags] = useState(seed?.accessAllTags ?? true);
  const [itemTagsSelected, setItemTagsSelected] = useState<string[]>(seedTags);
  const [tagsExclusive, setTagsExclusive] = useState(seed?.selectedTagsNotAccessible ?? false);
  const [accessExplicit, setAccessExplicit] = useState(seed?.accessExplicitContent ?? false);

  const toggleInArray = (arr: string[], v: string) =>
    arr.includes(v) ? arr.filter(x => x !== v) : [...arr, v];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    // Validate required fields before making the network call.
    if (!username.trim()) return setError('Username is required.');
    if (!isEdit && !password) return setError('Password is required.');
    setError('');
    setPending(true);
    try {
      // Build the full permissions blob from the editor state (both add + edit),
      // so a new account is created exactly as configured rather than relying on
      // server defaults.
      const permissions: UserPermissions = {
        download: canDownload,
        update: canUpdate,
        delete: canDelete,
        upload: canUpload,
        createEreader: canCreateEreader,
        accessAllLibraries,
        librariesAccessible: accessAllLibraries ? [] : librariesAccessible,
        accessAllTags,
        itemTagsSelected: accessAllTags ? [] : itemTagsSelected,
        selectedTagsNotAccessible: tagsExclusive,
        accessExplicitContent: accessExplicit,
      };
      await onSubmit(username.trim(), password, userType, email.trim(), enable, permissions);
    } catch (err) {
      log.warn('auth', 'user account mutation failed', { isEdit, err: String(err) });
      setError(errorMessage(err, { operation: 'save' }));
      setPending(false);
    }
  };

  // Shared label style above each field.
  const fieldLabel: React.CSSProperties = {
    fontFamily: MONO,
    fontSize: 'var(--fs-0)',
    letterSpacing: '0.1em',
    textTransform: 'uppercase',
    color: 'var(--onyx-text-mute)',
    marginBottom: 'var(--s-2)',
  };

  // Shared text-input style for username and password fields.
  const fieldInput: React.CSSProperties = {
    width: '100%',
    boxSizing: 'border-box',
    padding: 'var(--s-3) var(--s-3)',
    background: 'rgba(0,0,0,0.25)',
    border: '1px solid var(--onyx-glass-edge)',
    borderRadius: 'var(--r-sm)',
    color: 'var(--onyx-text)',
    fontSize: 'var(--fs-3)',
    outline: 'none',
    fontFamily: 'inherit',
  };

  // Two-column field/permission grid — the wider modal lets fields and the
  // permission toggles sit side by side, matching Skald's roomier settings panes.
  const twoCol: React.CSSProperties = { display: 'grid', gridTemplateColumns: '1fr 1fr', columnGap: 'var(--s-8)', rowGap: 'var(--s-4)' };
  // Indented detail box that holds the per-library / per-tag pickers.
  const pickerBox: React.CSSProperties = {
    display: 'flex', flexDirection: 'column', gap: 'var(--s-2)',
    padding: 'var(--s-3) var(--s-4)', borderRadius: 'var(--r-md)',
    background: 'rgba(0,0,0,0.18)', border: '1px solid var(--onyx-glass-edge)',
  };

  return (
    // Backdrop — clicking outside the panel cancels the modal.
    <div
      className="ui-scrim"  style={{ zIndex: 500 }}
      onMouseDown={e => { if (e.target === e.currentTarget) onCancel(); }}
    >
      {/* Glass panel — same visual spec as ConfirmDialog */}
      <form
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="user-modal-title"
        onSubmit={handleSubmit}
        style={{
          width: 560,
          maxWidth: '92vw',
          background: 'var(--surface-overlay)',
          backdropFilter: 'blur(40px) saturate(120%)',
          WebkitBackdropFilter: 'blur(40px) saturate(120%)',
          border: '1px solid var(--onyx-glass-edge)',
          borderRadius: 'var(--r-card)',
          boxShadow: 'var(--shadow-dialog)',
          padding: 'var(--s-6) var(--s-6) var(--s-6)',
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--s-5)',
          maxHeight: '90vh',
          overflowY: 'auto',
        }}
      >
        {/* Modal title */}
        <div id="user-modal-title" style={{ fontFamily: SERIF, fontSize: 'var(--fs-6)', fontWeight: 500, color: 'var(--onyx-text)' }}>
          {title}
        </div>

        {/* Identity — username + password side by side */}
        <div style={twoCol}>
          <div>
            <div style={fieldLabel}>{t('userModal.username')}</div>
            <input
              style={fieldInput}
              value={username}
              onChange={e => setUsername(e.target.value)}
              placeholder={t('userModal.usernamePlaceholder')}
              spellCheck={false}
              // Auto-focus the first field when the modal opens.
              autoFocus
            />
          </div>
          <div>
            <div style={fieldLabel}>
              Password
              {/* Show the "optional" hint only in edit mode. */}
              {isEdit && (
                <span style={{
                  fontFamily: MONO, fontSize: 'var(--fs-0)', color: 'var(--onyx-text-mute)',
                  marginLeft: 'var(--s-2)', letterSpacing: '0.04em', textTransform: 'none', fontWeight: 400,
                }}>
                  leave blank to keep existing
                </span>
              )}
            </div>
            <input
              style={fieldInput}
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="••••••••"
            />
          </div>
        </div>

        {/* Email — full width */}
        <div>
          <div style={fieldLabel}>{t('userModal.email')}<span style={{ textTransform: 'none', letterSpacing: '0.04em', fontWeight: 400 }}>{t('userModal.optional')}</span></div>
          <input
            style={fieldInput}
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            placeholder="email@example.com"
            spellCheck={false}
          />
        </div>

        {/* Account type + enable, side by side */}
        <div style={twoCol}>
          <div>
            <div style={fieldLabel}>{t('userModal.accountType')}</div>
            <div style={{ display: 'flex', gap: 'var(--s-2)' }}>
              <Pill active={userType === 'user'} onClick={() => setUserType('user')}>{t('userModal.roleUser')}</Pill>
              <Pill active={userType === 'admin'} onClick={() => setUserType('admin')}>{t('userModal.roleAdmin')}</Pill>
            </div>
          </div>
          <div>
            <div style={fieldLabel}>{t('userModal.enabled')}</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--s-3)', height: 30 }}>
              <PermToggle on={enable} onChange={setEnable} />
              <span style={{ fontSize: 'var(--fs-2)', color: 'var(--onyx-text-dim)' }}>{enable ? 'Account active' : 'Account disabled'}</span>
            </div>
          </div>
        </div>

        {/* ── Permissions (shown for both add + edit) — two columns of toggles ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-4)', paddingTop: 'var(--s-2)', borderTop: '1px solid var(--onyx-line)' }}>
          <div style={fieldLabel}>{t('userModal.permissions')}</div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', columnGap: 'var(--s-8)', rowGap: 'var(--s-4)' }}>
            <PermRow label={t('userModal.canDownload')}                on={canDownload}        onChange={setCanDownload} />
            <PermRow label={t('userModal.canUpdate')}                  on={canUpdate}          onChange={setCanUpdate} />
            <PermRow label={t('userModal.canDelete')}                  on={canDelete}          onChange={setCanDelete} />
            <PermRow label={t('userModal.canUpload')}                  on={canUpload}          onChange={setCanUpload} />
            <PermRow label={t('userModal.canEreader')}          on={canCreateEreader}   onChange={setCanCreateEreader} />
            <PermRow label={t('userModal.canExplicit')} on={accessExplicit}     onChange={setAccessExplicit} />
            <PermRow label={t('userModal.canAllLibraries')}    on={accessAllLibraries} onChange={setAccessAllLibraries} />
            <PermRow label={t('userModal.canAllTags')}         on={accessAllTags}      onChange={setAccessAllTags} />
          </div>

          {/* Library picker — shown when access-all is off (full width, 2-col list). */}
          {!accessAllLibraries && (
            <div style={pickerBox}>
              <div style={fieldLabel}>{t('userModal.accessibleLibraries')}</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '7px 20px', maxHeight: 150, overflowY: 'auto' }}>
                {libraries.length === 0 && <div style={{ fontFamily: MONO, fontSize: 'var(--fs-0)', color: 'var(--onyx-text-mute)' }}>{t('userModal.noLibraries')}</div>}
                {libraries.map(lib => (
                  <label key={lib.id} style={{ display: 'flex', alignItems: 'center', gap: 'var(--s-2)', fontSize: 'var(--fs-2)', color: 'var(--onyx-text-dim)', cursor: 'pointer' }}>
                    <input type="checkbox" style={{ accentColor: 'var(--onyx-accent)' }} checked={librariesAccessible.includes(lib.id)} onChange={() => setLibrariesAccessible(prev => toggleInArray(prev, lib.id))} />
                    {lib.name}
                  </label>
                ))}
              </div>
            </div>
          )}

          {/* Tag picker — shown when access-all is off: inclusive/exclusive mode
              plus the selectable tag chips. */}
          {!accessAllTags && (
            <div style={pickerBox}>
              <div style={fieldLabel}>{t('userModal.accessibleTags')}</div>
              <div style={{ display: 'flex', gap: 'var(--s-2)' }}>
                <Pill active={!tagsExclusive} onClick={() => setTagsExclusive(false)}>{t('userModal.onlySelected')}</Pill>
                <Pill active={tagsExclusive} onClick={() => setTagsExclusive(true)}>{t('userModal.allExcept')}</Pill>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--s-2)', maxHeight: 150, overflowY: 'auto' }}>
                {availableTags.length === 0 && <div style={{ fontFamily: MONO, fontSize: 'var(--fs-0)', color: 'var(--onyx-text-mute)' }}>{t('userModal.noTags')}</div>}
                {availableTags.map(tag => {
                  const on = itemTagsSelected.includes(tag);
                  return (
                    <button key={tag} type="button" onClick={() => setItemTagsSelected(prev => toggleInArray(prev, tag))}
                      style={{ padding: 'var(--s-1) var(--s-3)', borderRadius: 999, fontFamily: MONO, fontSize: 'var(--fs-0)', cursor: 'pointer',
                        background: on ? 'var(--onyx-accent-dim)' : 'transparent',
                        border: `1px solid ${on ? 'var(--onyx-accent-edge)' : 'var(--onyx-glass-edge)'}`,
                        color: on ? 'var(--onyx-accent)' : 'var(--onyx-text-dim)' }}>
                      {tag}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Inline validation / server error */}
        {error && (
          <div style={{ fontSize: 'var(--fs-2)', color: '#e8716a', fontFamily: MONO }}>
            {error}
          </div>
        )}

        {/* Action row: Cancel (ghost) + Create/Save (brass) */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--s-2)', marginTop: 'var(--s-1)' }}>
          <button
            type="button"
            onClick={onCancel}
            style={{
              padding: 'var(--s-2) var(--s-5)',
              background: 'transparent',
              border: '1px solid var(--onyx-glass-edge)',
              borderRadius: 'var(--r-sm)',
              color: 'var(--onyx-text-dim)',
              fontFamily: MONO,
              fontSize: 'var(--fs-1)',
              letterSpacing: '0.07em',
              textTransform: 'uppercase' as const,
              cursor: 'pointer',
            }}
          >
            {t('userModal.cancel')}
          </button>
          <button
            type="submit"
            disabled={pending}
            style={{
              padding: 'var(--s-2) var(--s-5)',
              // Theme accent (follows the selected accent), not a hardcoded gold gradient.
              background: 'var(--onyx-accent)',
              border: '1px solid var(--onyx-accent-edge)',
              borderRadius: 'var(--r-sm)',
              color: 'var(--onyx-bg)',
              fontFamily: MONO,
              fontSize: 'var(--fs-1)',
              letterSpacing: '0.07em',
              textTransform: 'uppercase' as const,
              cursor: pending ? 'wait' : 'pointer',
              fontWeight: 600,
            }}
          >
            {/* Label changes to show progress while the request is in flight. */}
            {pending ? (isEdit ? 'Saving…' : 'Creating…') : (isEdit ? 'Save' : 'Create')}
          </button>
        </div>
      </form>
    </div>
  );
}
