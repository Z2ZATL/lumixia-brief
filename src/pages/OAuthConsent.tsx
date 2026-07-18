import { useEffect, useRef, useState } from 'react';
import { getSupabaseBrowserClient } from '../auth/client';
import { useI18n } from '../i18n';

interface ConsentDetails {
  clientId: string;
  clientName: string;
  scopes: string[];
  redirectUri: string;
}

export function OAuthConsent() {
  const { t } = useI18n();
  const consent = useConsentFlow(t);
  const { details, error, busy, decide } = consent;
  return (
    <main className="auth-shell">
      <section className="auth-card codex-consent" aria-labelledby="codex-consent-title">
        <span className="eyebrow">{t('codexConnection')}</span>
        <h1 id="codex-consent-title">{t('codexConsentTitle')}</h1>
        <p>{t('codexConsentBody')}</p>
        {error && (
          <div className="alert error" role="alert">
            {error}
          </div>
        )}
        {!error && !details && <div className="spinner" role="status" aria-label={t('loading')} />}
        {details && <ConsentDecision details={details} busy={busy} decide={decide} t={t} />}
      </section>
    </main>
  );
}

type Translate = ReturnType<typeof useI18n>['t'];

function useConsentFlow(t: Translate) {
  const [authorizationId] = useState(readAuthorizationId);
  const [details, setDetails] = useState<ConsentDetails | null>(null);
  const [error, setError] = useState(() => (authorizationId ? '' : t('codexConsentInvalid')));
  const [busy, setBusy] = useState(false);
  const detailsRequest = useRef<ReturnType<typeof loadConsent> | null>(null);
  const deciding = useRef(false);
  useEffect(() => {
    window.history.replaceState({}, '', '/oauth/consent');
    if (!authorizationId) return undefined;
    let active = true;
    detailsRequest.current ??= loadConsent(authorizationId);
    void detailsRequest.current
      .then((result) => {
        if (!active) return;
        if ('redirectUrl' in result) redirectToClient(result.redirectUrl);
        else setDetails(result);
      })
      .catch(() => {
        if (active) setError(t('codexConsentInvalid'));
      });
    return () => {
      active = false;
    };
  }, [authorizationId, t]);

  const decide = async (approved: boolean) => {
    if (!authorizationId || deciding.current) return;
    deciding.current = true;
    setBusy(true);
    setError('');
    try {
      const client = getSupabaseBrowserClient();
      const oauth = client.auth.oauth;
      if (approved && details) {
        const grant = await client.rpc('authorize_codex_connection', {
          p_client_id: details.clientId,
        });
        if (grant.error || grant.data !== true) throw new Error('MCP_GRANT_FAILED');
      }
      const response = approved
        ? await oauth.approveAuthorization(authorizationId, { skipBrowserRedirect: true })
        : await oauth.denyAuthorization(authorizationId, { skipBrowserRedirect: true });
      if (response.error || !response.data) throw new Error('OAUTH_CONSENT_FAILED');
      redirectToClient(response.data.redirect_url);
    } catch {
      setError(t('codexConsentFailed'));
      setBusy(false);
      deciding.current = false;
    }
  };
  return { details, error, busy, decide };
}

function ConsentDecision({
  details,
  busy,
  decide,
  t,
}: {
  details: ConsentDetails;
  busy: boolean;
  decide: (approved: boolean) => Promise<void>;
  t: Translate;
}) {
  return (
    <>
      <dl className="consent-details">
        <div>
          <dt>{t('codexClient')}</dt>
          <dd>{details.clientName}</dd>
        </div>
        <div>
          <dt>{t('codexPermissions')}</dt>
          <dd>{details.scopes.join(', ') || 'openid'}</dd>
        </div>
        <div>
          <dt>{t('codexRedirectTarget')}</dt>
          <dd>
            <code>{details.redirectUri}</code>
          </dd>
        </div>
      </dl>
      <p className="consent-note">{t('codexConsentBoundary')}</p>
      <div className="consent-actions">
        <button className="button ghost" disabled={busy} onClick={() => void decide(false)}>
          {t('deny')}
        </button>
        <button className="button primary" disabled={busy} onClick={() => void decide(true)}>
          {busy ? t('loading') : t('allowCodex')}
        </button>
      </div>
    </>
  );
}

async function loadConsent(
  authorizationId: string,
): Promise<ConsentDetails | { redirectUrl: string }> {
  const response =
    await getSupabaseBrowserClient().auth.oauth.getAuthorizationDetails(authorizationId);
  if (response.error || !response.data) throw new Error('OAUTH_DETAILS_FAILED');
  if ('redirect_url' in response.data) return { redirectUrl: response.data.redirect_url };
  return {
    clientId: response.data.client.id,
    clientName: response.data.client.name,
    scopes: response.data.scope.split(' ').filter(Boolean),
    redirectUri: response.data.redirect_uri,
  };
}

function readAuthorizationId(): string | null {
  const value = new URLSearchParams(window.location.search).get('authorization_id');
  return value && /^[a-zA-Z0-9_-]{8,200}$/.test(value) ? value : null;
}

function redirectToClient(target: string): void {
  const url = new URL(target);
  const localHttp = url.protocol === 'http:' && ['127.0.0.1', 'localhost'].includes(url.hostname);
  if (url.protocol !== 'https:' && !localHttp) throw new Error('UNSAFE_OAUTH_REDIRECT');
  window.location.assign(url.href);
}
