import { useEffect, useState } from 'react';
import { api } from '../lib/api';

export function Settings() {
  const [status, setStatus] = useState<{ connected: boolean; workspaceName: string | null } | null>(
    null,
  );
  const [error, setError] = useState('');
  useEffect(() => {
    api<{ connected: boolean; workspaceName: string | null }>('/notion/status')
      .then(setStatus)
      .catch((error: Error) => setError(error.message));
  }, []);

  async function connect() {
    try {
      const result = await api<{ authorizationUrl: string }>('/notion/connect');
      window.location.assign(result.authorizationUrl);
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Could not connect.');
    }
  }
  async function disconnect() {
    try {
      await api('/notion/disconnect', { method: 'DELETE' });
      setStatus({ connected: false, workspaceName: null });
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Could not disconnect.');
    }
  }
  return (
    <main className="page-shell settings-page">
      <div className="page-heading">
        <div>
          <span className="eyebrow">CONTROLLED HANDOFFS</span>
          <h1>Connections</h1>
          <p>External tools receive content only after you approve an immutable brief.</p>
        </div>
      </div>
      {error && <div className="alert error">{error}</div>}
      <section className="connection-card">
        <div className="notion-logo">N</div>
        <div>
          <h2>Notion</h2>
          <p>
            Create an idempotent child page under the parent you select. OAuth tokens are encrypted
            with AES-256-GCM.
          </p>
          <span className={`connection-status ${status?.connected ? 'connected' : ''}`}>
            {status?.connected
              ? `Connected${status.workspaceName ? ` · ${status.workspaceName}` : ''}`
              : 'Not connected'}
          </span>
        </div>
        {status?.connected ? (
          <button className="button ghost danger" onClick={disconnect}>
            Disconnect
          </button>
        ) : (
          <button className="button primary" onClick={connect}>
            Connect Notion →
          </button>
        )}
      </section>
      <section className="security-notes">
        <h2>What leaves Lumixia?</h2>
        <div>
          <article>
            <b>OpenAI</b>
            <p>
              Interview context only when you submit an answer; requests use{' '}
              <code>store:false</code>.
            </p>
          </article>
          <article>
            <b>Notion</b>
            <p>Only the approved brief version you explicitly sync.</p>
          </article>
          <article>
            <b>Monitoring</b>
            <p>
              Route, status, latency, request ID, deployment SHA—never answers or brief content.
            </p>
          </article>
        </div>
      </section>
    </main>
  );
}
