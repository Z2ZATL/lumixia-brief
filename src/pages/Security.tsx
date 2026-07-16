import { useAuth } from '../auth/useAuth';
import { useI18n } from '../i18n';

export function Security() {
  const auth = useAuth();
  const { t } = useI18n();
  return (
    <main className="page-shell settings-page">
      <div className="page-heading">
        <div>
          <span className="eyebrow">AAL2 · TOTP</span>
          <h1>{t('security')}</h1>
          <p>{t('securityBody')}</p>
        </div>
      </div>
      {auth.error && (
        <div className="alert error" role="alert">
          {auth.error}
        </div>
      )}
      <section className="security-manager">
        <div className="security-manager-heading">
          <div>
            <h2>{t('verifiedAuthenticators')}</h2>
            <p>{t('signedInSecurely')}</p>
          </div>
          {auth.factors.length < 2 && (
            <button
              className="button primary"
              onClick={() => auth.startEnrollment(t('backupAuthenticator'))}
              disabled={auth.busy}
            >
              {t('addBackup')}
            </button>
          )}
        </div>
        {auth.factors.length === 1 && (
          <div className="backup-callout">{t('backupRecommended')}</div>
        )}
        <div className="factor-list">
          {auth.factors.map((factor, index) => (
            <article key={factor.id} className="factor-row">
              <span className="factor-icon" aria-hidden="true">
                {index + 1}
              </span>
              <div>
                <b>
                  {factor.friendly_name ??
                    (index ? t('backupAuthenticator') : t('primaryAuthenticator'))}
                </b>
                <small>{new Date(factor.created_at).toLocaleDateString()}</small>
              </div>
              <button
                className="button ghost danger small"
                onClick={() => auth.removeFactor(factor.id)}
                disabled={auth.busy || auth.factors.length <= 1}
                title={auth.factors.length <= 1 ? t('lastFactorProtected') : undefined}
              >
                {t('removeAuthenticator')}
              </button>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
