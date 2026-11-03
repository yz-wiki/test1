import { t } from '../i18n';

export type ErrorKind = 'unreachable' | 'tls' | 'unauthorized' | 'forbidden' | 'not-found' | 'conflict' | 'capacity' | 'validation' | 'offline-queued' | 'unexpected';

export interface PresentedError {
  kind: ErrorKind;
  title: string;
  message: string;
  action?: string;
  showLogHint: boolean;
}

export interface ErrorPresentationContext {
  operation?: 'authenticate' | 'download' | 'delete' | 'save' | 'import' | 'refresh';
  credential?: 'api-key' | 'password' | 'saved-session';
}

function errorText(error: unknown): string {
  if (typeof error === 'string') return error;
  if (error instanceof Error) return error.message;
  return '';
}

/** Translate technical failures without returning raw response text to the UI.
 *
 *  Every branch resolves its copy through `t()` at call time — the function is
 *  invoked from event handlers, so it always reflects the currently selected
 *  locale. Branch *selection* still keys off the raw error text, which is
 *  English by nature (transport/HTTP diagnostics). */
export function presentError(error: unknown, context: ErrorPresentationContext = {}): PresentedError {
  const raw = errorText(error).toLowerCase();
  const authentication = context.operation === 'authenticate';

  if (/certificate|cert |tls|ssl|unknown issuer|invalid peer/.test(raw)) {
    return { kind: 'tls', title: t('err.tls.title'), message: t('err.tls.message'), action: t('err.tls.action'), showLogHint: true };
  }
  // The single most common self-hosted mistake: typing https:// for a server that
  // only listens on plain HTTP. reqwest reports that as a generic send failure, so
  // without this branch the user is told to "check the address" — which is exactly
  // what they did check. Name the scheme mismatch instead.
  if (raw.includes('https://') && /error sending request|handshake|connection (closed|reset|refused)|unexpected eof|tls|ssl/.test(raw)) {
    return { kind: 'tls', title: t('err.scheme.title'), message: t('err.scheme.message'), action: t('err.scheme.action'), showLogHint: true };
  }
  if (/401|unauthori[sz]ed|invalid (api )?key|invalid credentials|incorrect password|authentication failed/.test(raw)) {
    const credentialKey = context.credential === 'api-key'
      ? 'err.cred.apiKey'
      : context.credential === 'saved-session'
        ? 'err.cred.savedSession'
        : 'err.cred.password';
    return {
      kind: 'unauthorized',
      title: t('err.unauthorized.title'),
      message: t('err.unauthorized.message', { credential: t(credentialKey) }),
      action: context.credential === 'api-key' ? t('err.unauthorized.actionApiKey') : t('err.unauthorized.action'),
      showLogHint: false,
    };
  }
  if (/403|forbidden|permission denied|not permitted/.test(raw)) {
    return {
      kind: 'forbidden',
      title: t('err.forbidden.title'),
      message: authentication ? t('err.forbidden.messageAuth') : t('err.forbidden.message'),
      action: t('err.forbidden.action'),
      showLogHint: false,
    };
  }
  if (/404|not found/.test(raw)) {
    return {
      kind: 'not-found',
      title: authentication ? t('err.notFound.titleAuth') : t('err.notFound.title'),
      message: authentication ? t('err.notFound.messageAuth') : t('err.notFound.message'),
      action: authentication ? t('err.notFound.actionAuth') : t('err.notFound.action'),
      showLogHint: true,
    };
  }
  if (/409|conflict|already exists|duplicate/.test(raw)) {
    return { kind: 'conflict', title: t('err.conflict.title'), message: t('err.conflict.message'), action: t('err.conflict.action'), showLogHint: false };
  }
  if (/no space|disk full|insufficient (disk|space|storage)|not enough (disk|space|storage)|capacity/.test(raw)) {
    return { kind: 'capacity', title: t('err.capacity.title'), message: t('err.capacity.message'), action: t('err.capacity.action'), showLogHint: false };
  }
  if (/offline.*queue|queued.*offline/.test(raw)) {
    return { kind: 'offline-queued', title: t('err.queued.title'), message: t('err.queued.message'), showLogHint: false };
  }
  if (/invalid|validation|required|must be|unsupported|bad request|400/.test(raw)) {
    return { kind: 'validation', title: t('err.validation.title'), message: t('err.validation.message'), action: t('err.validation.action'), showLogHint: false };
  }
  if (/dns|resolve|connection refused|connect error|failed to connect|network|timed? out|timeout|unreachable|could not connect|error sending request/.test(raw)) {
    return { kind: 'unreachable', title: t('err.unreachable.title'), message: t('err.unreachable.message'), action: t('err.unreachable.action'), showLogHint: true };
  }
  return {
    kind: 'unexpected',
    title: t('err.unexpected.title'),
    message: authentication ? t('err.unexpected.messageAuth') : t('err.unexpected.message'),
    action: t('err.unexpected.action'),
    showLogHint: true,
  };
}

export function errorMessage(error: unknown, context: ErrorPresentationContext = {}): string {
  const presented = presentError(error, context);
  return [presented.message, presented.action].filter(Boolean).join(' ');
}
