import { useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/useAuth';
import { useI18n } from '../i18n';

export function AuthCallback() {
  const auth = useAuth();
  const { t } = useI18n();
  const navigate = useNavigate();
  const completion = useRef<Promise<string | null> | null>(null);
  useEffect(() => {
    completion.current ??= auth.completeOAuthCallback(window.location.search);
    let active = true;
    void completion.current
      .then((path) => {
        if (active && path) void navigate(path, { replace: true });
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [auth, navigate]);
  if (auth.stage === 'recoverable_error') {
    return (
      <main className="callback-stage">
        <div className="alert error" role="alert">
          {auth.error}
        </div>
        <Link className="button primary" to="/projects">
          {t('authRetry')}
        </Link>
      </main>
    );
  }
  return (
    <main className="callback-stage">
      <div className="spinner" role="status" aria-label={t('oauthWorking')} />
      <p>{t('oauthWorking')}</p>
    </main>
  );
}
