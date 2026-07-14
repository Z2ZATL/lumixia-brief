import type { Translator } from '../brief/meta';

interface ConnectionPanelProps {
  connected: boolean;
  workspaceName: string | null;
  busy: boolean;
  t: Translator;
  onConnect: () => Promise<void>;
  onDisconnect: () => Promise<void>;
}

export function ConnectionPanel(props: ConnectionPanelProps) {
  const status = props.connected
    ? `${props.t('connected')}${props.workspaceName ? ` · ${props.workspaceName}` : ''}`
    : props.t('notConnected');
  return (
    <section className="connection-card">
      <div className="notion-logo">N</div>
      <div>
        <h2>Notion</h2>
        <p>{props.t('notionDescription')}</p>
        <span className={`connection-status ${props.connected ? 'connected' : ''}`}>{status}</span>
      </div>
      {props.connected ? (
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
