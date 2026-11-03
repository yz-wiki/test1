// Sign-in screen.
//
// Deliberately plain: one centred card on the app canvas, the same controls the
// rest of the app uses. The previous version was a two-column editorial poster
// with serif display type, a gold gradient CTA and a grain overlay — none of
// which shared a single token with the application it was signing you into.
import { useState, useRef, useEffect } from 'react';
import { useI18n } from '../i18n';
import type { OnyxState } from '../state/onyx';
import { login, saveToken, loginWithApiKey } from '../api/abs';
import Titlebar from '../components/chrome/Titlebar';
import lyreIcon from '../assets/lyre.png';
import { errorMessage } from '../lib/presentError';
import { log } from '../lib/log';
import { Button, Field, Input, Segmented } from '../ui';

export interface LoginProps {
  st: OnyxState;
}

export default function Login({ st }: LoginProps) {
  const { t } = useI18n();

  const lastServer = (() => {
    try { return new URL(localStorage.getItem('skald.lastServerUrl') ?? ''); } catch { return null; }
  })();
  const [scheme, setScheme] = useState<'http' | 'https'>(() => lastServer?.protocol === 'https:' ? 'https' : 'http');
  const [host, setHost] = useState(() => lastServer?.host ?? '');
  const [user, setUser] = useState('');
  const [pass, setPass] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  // API key is the primary method — one paste instead of two credentials.
  const [method, setMethod] = useState<'password' | 'apikey'>('apikey');
  const [apiKey, setApiKey] = useState('');

  const formRef = useRef<HTMLFormElement>(null);

  // Focus the first empty field on mount so the keyboard flow starts correctly.
  useEffect(() => {
    const target = formRef.current?.querySelector<HTMLElement>('input, textarea');
    target?.focus();
  }, []);

  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!host.trim()) return setError(t('loginUi.errServerRequired'));
    const serverUrl = `${scheme}://${host.trim()}`;

    if (method === 'apikey') {
      if (!apiKey.trim()) return setError(t('loginUi.errKeyRequired'));
      setError('');
      setPending(true);
      try {
        const result = await loginWithApiKey(serverUrl, apiKey.trim());
        // Store the session JWT, not the raw API key: the socket auth middleware
        // validates the JWT, and the key was only used once to obtain it.
        await saveToken(result.token);
        localStorage.setItem('skald.lastServerUrl', serverUrl);
        st.setAuthToken(result.token);
        st.setServerUrl(serverUrl);
        st.setUserId(result.user.id);
        st.setUsername(result.user.username);
        st.setUser(result.user);
        if (result.serverSettings) st.setServerSettings(result.serverSettings);
        st.setScreen('library');
      } catch (err) {
        log.warn('auth', 'api key sign-in failed', { err: String(err) });
        setError(errorMessage(err, { operation: 'authenticate', credential: 'api-key' }));
        setPending(false);
      }
      return;
    }

    if (!user.trim()) return setError(t('loginUi.errNameRequired'));
    if (!pass) return setError(t('loginUi.errPasswordRequired'));
    setError('');
    setPending(true);
    try {
      const { user: loggedInUser, serverSettings } = await login(serverUrl, user.trim(), pass);
      if (serverSettings) st.setServerSettings(serverSettings);
      // No saveToken here: the login command already wrote the full credential
      // set (access + refresh + legacy) to the keyring. Re-saving the single
      // bearer token would overwrite it with a legacy-only entry.
      localStorage.setItem('skald.lastServerUrl', serverUrl);
      st.setAuthToken(loggedInUser.token);
      st.setServerUrl(serverUrl);
      st.setUserId(loggedInUser.id);
      st.setUsername(loggedInUser.username);
      st.setUser(loggedInUser);
      st.setScreen('library');
    } catch (err) {
      log.warn('auth', 'password sign-in failed', { err: String(err) });
      setError(errorMessage(err, { operation: 'authenticate', credential: 'password' }));
      setPending(false);
    }
  };

  return (
    <div className="ui-root" style={{ position: 'fixed', inset: 0, display: 'flex', flexDirection: 'column', background: 'var(--surface-canvas)', color: 'var(--onyx-text)' }}>
      <Titlebar minimal />

      <div style={{ flex: 1, display: 'grid', placeItems: 'center', padding: 'var(--s-6)', overflowY: 'auto' }}>
        <form
          ref={formRef}
          onSubmit={submit}
          className="ui-card ui-card--pad"
          style={{ width: '100%', maxWidth: 400, padding: 'var(--s-8)', display: 'flex', flexDirection: 'column', gap: 'var(--s-5)' }}
        >
          {/* Wordmark + heading */}
          <header style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-2)' }}>
            <div className="ui-rowline" style={{ gap: 'var(--s-2)' }}>
              <img src={lyreIcon} alt="" aria-hidden="true" style={{ width: 22, height: 22, objectFit: 'contain' }} />
              <span style={{ fontSize: 'var(--fs-4)', fontWeight: 650, letterSpacing: '-0.01em' }}>Skald</span>
            </div>
            <h1 className="ui-title" style={{ fontSize: 'var(--fs-6)' }}>{t('loginUi.enterHall')}</h1>
            <p className="ui-sub" style={{ margin: 0 }}>{t('loginUi.connectHint')}</p>
          </header>

          {/* Auth method */}
          <Segmented
            value={method}
            onChange={(next) => { setMethod(next); setError(''); }}
            label={t('loginUi.method')}
            options={[
              { value: 'apikey', label: t('loginUi.methodApiKey') },
              { value: 'password', label: t('loginUi.methodPassword') },
            ]}
          />

          {/* Server */}
          <div style={{ display: 'flex', gap: 'var(--s-2)', alignItems: 'flex-end' }}>
            <div style={{ width: 96, flex: '0 0 96px' }}>
              <Field label={t('loginUi.scheme')}>
                <select
                  className="ui-select"
                  value={scheme}
                  onChange={(e) => setScheme(e.target.value as 'http' | 'https')}
                  aria-label={t('loginUi.scheme')}
                >
                  <option value="https">https://</option>
                  <option value="http">http://</option>
                </select>
              </Field>
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <Field label={t('loginUi.serverQuestion')}>
                <Input
                  value={host}
                  onChange={(e) => setHost(e.target.value)}
                  placeholder={t('loginUi.serverPlaceholder')}
                  spellCheck={false}
                  autoComplete="off"
                />
              </Field>
            </div>
          </div>

          {/* Credentials */}
          {method === 'password' ? (
            <>
              <Field label={t('loginUi.nameQuestion')}>
                <Input
                  value={user}
                  onChange={(e) => setUser(e.target.value)}
                  placeholder={t('loginUi.usernamePlaceholder')}
                  spellCheck={false}
                  autoComplete="username"
                />
              </Field>
              <Field label={t('loginUi.password')}>
                <Input
                  type="password"
                  value={pass}
                  onChange={(e) => setPass(e.target.value)}
                  placeholder="••••••••••"
                  autoComplete="current-password"
                />
              </Field>
            </>
          ) : (
            <Field label={t('loginUi.apiKey')} hint={t('loginUi.apiKeyHint')}>
              <textarea
                className="ui-textarea ui-textarea--tech"
                rows={3}
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder={t('loginUi.apiKeyPlaceholder')}
                spellCheck={false}
                autoComplete="off"
                style={{ resize: 'none' }}
              />
            </Field>
          )}

          {error && (
            <div
              role="alert"
              style={{
                padding: 'var(--s-2) var(--s-3)',
                borderRadius: 'var(--r-control)',
                border: '1px solid rgba(226, 104, 95, 0.35)',
                background: 'rgba(226, 104, 95, 0.1)',
                color: '#e2685f',
                fontSize: 'var(--fs-2)',
                lineHeight: 'var(--lh-normal)',
              }}
            >
              {error}
            </div>
          )}

          <Button type="submit" tone="primary" size="lg" block disabled={pending}>
            {pending ? t('loginUi.opening') : t('loginUi.enterHall')}
          </Button>

          <button
            type="button"
            onClick={() => { st.setLocalMode(true); st.setScreen('library'); }}
            className="ui-btn ui-btn--ghost ui-btn--sm"
            style={{ alignSelf: 'center' }}
          >
            {t('loginUi.localMode')}
          </button>
        </form>
      </div>
    </div>
  );
}
