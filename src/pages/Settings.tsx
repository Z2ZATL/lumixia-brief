import { ConnectionPanel, PrivacyPanels } from '../features/settings/SettingsPanels';
import { useNotionConnection } from '../features/settings/useNotionConnection';
import { useI18n } from '../i18n';

export function Settings() {
  const { t } = useI18n();
  const notion = useNotionConnection(t);
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
        workspaceName={notion.status?.workspaceName ?? null}
        busy={notion.busy}
        t={t}
        onConnect={notion.connect}
        onDisconnect={notion.disconnect}
      />
      <PrivacyPanels t={t} />
    </main>
  );
}
