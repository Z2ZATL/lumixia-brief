import {
  CodexBridgePanel,
  ConnectionPanel,
  PrivacyPanels,
} from '../features/settings/SettingsPanels';
import { useCodexBridge } from '../features/settings/useCodexBridge';
import { useNotionConnection } from '../features/settings/useNotionConnection';
import { useI18n } from '../i18n';

export function Settings() {
  const { t } = useI18n();
  const notion = useNotionConnection(t);
  const codexBridge = useCodexBridge(t);
  return (
    <main className="page-shell settings-page">
      <div className="page-heading">
        <div>
          <span className="eyebrow">{t('controlledHandoffs')}</span>
          <h1>{t('settings')}</h1>
          <p>{t('connectionsBody')}</p>
        </div>
      </div>
      {notion.error && (
        <div className="alert error" role="alert">
          {notion.error}
        </div>
      )}
      <ConnectionPanel
        connected={Boolean(notion.status?.connected)}
        loading={notion.status === null && !notion.error}
        workspaceName={notion.status?.workspaceName ?? null}
        busy={notion.busy}
        t={t}
        onConnect={notion.connect}
        onDisconnect={notion.disconnect}
      />
      <section className="connection-card codex-card" aria-labelledby="codex-connection-title">
        <div className="codex-logo" aria-hidden="true">
          C
        </div>
        <div>
          <h2 id="codex-connection-title">Codex</h2>
          <p>{t('codexSettingsBody')}</p>
          <code>{`${window.location.origin}/api/mcp`}</code>
        </div>
        <span className="connection-status connected">{t('noApiCharge')}</span>
      </section>
      {codexBridge.error && (
        <div className="alert error" role="alert">
          {codexBridge.error}
        </div>
      )}
      <CodexBridgePanel
        connectedModel={codexBridge.status?.model ?? null}
        supported={codexBridge.supported}
        busy={codexBridge.busy}
        t={t}
        onConnect={codexBridge.connect}
        onDisconnect={codexBridge.disconnect}
      />
      <PrivacyPanels t={t} />
    </main>
  );
}
