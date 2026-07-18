import type { Translator } from '../brief/meta';

interface ConnectionPanelProps {
  connected: boolean;
  loading: boolean;
  workspaceName: string | null;
  busy: boolean;
  t: Translator;
  onConnect: () => Promise<void>;
  onDisconnect: () => Promise<void>;
}

interface CodexBridgePanelProps {
  connectedModel: string | null;
  supported: boolean | null;
  busy: boolean;
  t: Translator;
  onConnect: () => Promise<void>;
  onDisconnect: () => void;
}

export function ConnectionPanel(props: ConnectionPanelProps) {
  const status = props.loading
    ? props.t('checkingConnection')
    : props.connected
      ? `${props.t('connected')}${props.workspaceName ? ` · ${props.workspaceName}` : ''}`
      : props.t('notConnected');
  return (
    <section className="connection-card">
      <div className="notion-logo">N</div>
      <div>
        <h2>Notion</h2>
        <p>{props.t('notionDescription')}</p>
        <span
          className={`connection-status ${props.connected ? 'connected' : ''}`}
          role={props.loading ? 'status' : undefined}
        >
          {status}
        </span>
      </div>
      {props.loading ? (
        <button className="button ghost" disabled>
          {props.t('checkingConnection')}
        </button>
      ) : props.connected ? (
        <button className="button ghost danger" onClick={props.onDisconnect} disabled={props.busy}>
          {props.t('disconnect')}
        </button>
      ) : (
        <button className="button primary" onClick={props.onConnect} disabled={props.busy}>
          {props.t('connectNotionAction')} →
        </button>
      )}
    </section>
  );
}

export function CodexBridgePanel(props: CodexBridgePanelProps) {
  const connected = Boolean(props.connectedModel);
  const status = connected
    ? `${props.t('codexBridgeConnected')} · ${props.connectedModel}`
    : props.supported === false
      ? props.t('codexBridgeDisabled')
      : props.t('codexBridgeUnavailable');
  return (
    <section className="connection-card codex-card" aria-labelledby="codex-bridge-title">
      <div className="codex-logo" aria-hidden="true">
        C
      </div>
      <div>
        <h2 id="codex-bridge-title">{props.t('codexBridgeTitle')}</h2>
        <p>{props.t('codexBridgeBody')}</p>
        <span className={`connection-status ${connected ? 'connected' : ''}`}>{status}</span>
      </div>
      {connected ? (
        <button className="button ghost" onClick={props.onDisconnect} disabled={props.busy}>
          {props.t('disconnect')}
        </button>
      ) : (
        <button
          className="button primary"
          onClick={props.onConnect}
          disabled={props.busy || props.supported !== true}
        >
          {props.busy ? props.t('checkingConnection') : props.t('codexBridgeConnect')} →
        </button>
      )}
    </section>
  );
}

export function PrivacyPanels({ t }: { t: Translator }) {
  return (
    <section className="security-notes">
      <h2>{t('whatLeaves')}</h2>
      <div>
        <article>
          <b>OpenAI</b>
          <p>{t('openAiPrivacy')}</p>
        </article>
        <article>
          <b>{t('codexBridgeTitle')}</b>
          <p>{t('codexBridgePrivacy')}</p>
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
  );
}
