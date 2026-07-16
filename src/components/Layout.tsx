import { Link, NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../auth/useAuth';
import { useI18n } from '../i18n';

export function Logo() {
  const { t } = useI18n();
  return (
    <Link to="/" className="logo" aria-label={t('home')}>
      <span className="logo-mark">L</span>
      <span>
        Lumixia <em>Brief</em>
      </span>
    </Link>
  );
}

export function LocaleSwitch() {
  const { locale, setLocale, t } = useI18n();
  return (
    <button
      className="locale-switch"
      onClick={() => setLocale(locale === 'en' ? 'th' : 'en')}
      aria-label={t('switchLanguage')}
    >
      {locale === 'en' ? 'TH' : 'EN'}
    </button>
  );
}

export function AppLayout() {
  const auth = useAuth();
  const { t } = useI18n();
  return (
    <div className="app-frame">
      <header className="app-header">
        <Logo />
        <nav>
          <NavLink to="/projects">{t('projects')}</NavLink>
          <NavLink to="/settings">{t('settings')}</NavLink>
          <NavLink to="/security">{t('security')}</NavLink>
        </nav>
        <div className="header-actions">
          <LocaleSwitch />
          {auth.localDemo ? (
            <span className="demo-pill">{t('localDemo')}</span>
          ) : (
            <AccountControls />
          )}
        </div>
      </header>
      <Outlet />
    </div>
  );
}

function AccountControls() {
  const auth = useAuth();
  const { t } = useI18n();
  const name = displayName(auth.user?.user_metadata ?? {});
  return (
    <div className="account-controls">
      <Link to="/security" className="account-chip" aria-label={t('account')}>
        <span aria-hidden="true">{name.slice(0, 1).toUpperCase()}</span>
      </Link>
      <button className="sign-out-button" onClick={auth.signOut} disabled={auth.busy}>
        {t('signOut')}
      </button>
    </div>
  );
}

function displayName(metadata: Record<string, unknown>): string {
  const name = metadata['full_name'] ?? metadata['name'];
  return typeof name === 'string' && name.trim() ? name.trim() : 'User';
}
