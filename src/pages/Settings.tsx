import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { useI18n } from '../i18n';

export function Settings() {
  const { t } = useI18n();
  const [status, setStatus] = useState<{ connected: boolean; workspaceName: string | null } | null>(
    null,
  );
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let active = true;
    api<{ connected: boolean; workspaceName: string | null }>('/notion/status')
      .then((status) => {
        if (active) setStatus(status);
      })
      .catch((error: Error) => {
        if (active) setError(error.message);
      });
    return () => {
      active = false;
    };
  }, []);

  async function connect() {
    if (busy) return;
    setBusy(true);
    try {
      const result = await api<{ authorizationUrl: string }>('/notion/connect');
      window.location.assign(result.authorizationUrl);
    } catch (error) {
      setError(error instanceof Error ? error.message : t('connectFailed'));
      setBusy(false);
    }
  }
  async function disconnect() {
    if (busy) return;
    setBusy(true);
    try {
      await api('/notion/disconnect', { method: 'DELETE' });
      setStatus({ connected: false, workspaceName: null });
    } catch (error) {
      setError(error instanceof Error ? error.message : t('disconnectFailed'));
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="page-shell settings-page">
      <div className="page-heading">
        <div>
          <span className="eyebrow">{t('controlledHandoffs')}</span>
          <h1>{t('settings')}</h1>
          <p>{t('connectionsBody')}</p>
        </div>
      </div>
      {error && (
        <div className="alert error" role="alert">
          {error}
        </div>
      )}
      <section className="connection-card">
        <div className="notion-logo">N</div>
        <div>
          <h2>Notion</h2>
          <p>{t('notionDescription')}</p>
          <span className={`connection-status ${status?.connected ? 'connected' : ''}`}>
            {status?.connected
              ? `${t('connected')}${status.workspaceName ? ` · ${status.workspaceName}` : ''}`
              : t('notConnected')}
          </span>
        </div>
        {status?.connected ? (
          <button className="button ghost danger" onClick={disconnect} disabled={busy}>
            {t('disconnect')}
          </button>
        ) : (
          <button className="button primary" onClick={connect} disabled={busy}>
            {t('connectNotionAction')} →
          </button>
        )}
      </section>
      <section className="security-notes">
        <h2>{t('whatLeaves')}</h2>
        <div>
          <article>
            <b>OpenAI</b>
            <p>{t('openAiPrivacy')}</p>
          </article>
          <article>
            <b>Notion</b>
            <p>{t('notionPrivacy')}</p>
          </article>
          <article>
            <b>{t('monitoring')}</b>
            <p>{t('monitoringPrivacy')}</p>
          </article>
        </div>
      </section>
    </main>
  );
}
