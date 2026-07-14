import { UserButton } from '@clerk/react';
import { Link, NavLink, Outlet } from 'react-router-dom';
import { useI18n } from '../i18n';

export function Logo() {
  return (
    <Link to="/" className="logo" aria-label="Lumixia Brief home">
      <span className="logo-mark">L</span>
      <span>
        Lumixia <em>Brief</em>
      </span>
    </Link>
  );
}

export function LocaleSwitch() {
  const { locale, setLocale } = useI18n();
  return (
    <button
      className="locale-switch"
      onClick={() => setLocale(locale === 'en' ? 'th' : 'en')}
      aria-label="Switch language"
    >
      {locale === 'en' ? 'TH' : 'EN'}
    </button>
  );
}

export function AppLayout({ localMode }: { localMode: boolean }) {
  const { t } = useI18n();
  return (
    <div className="app-frame">
      <header className="app-header">
        <Logo />
        <nav>
          <NavLink to="/projects">{t('projects')}</NavLink>
          <NavLink to="/settings">{t('settings')}</NavLink>
        </nav>
        <div className="header-actions">
          <LocaleSwitch />
          {localMode ? <span className="demo-pill">Local demo</span> : <UserButton />}
        </div>
      </header>
      <Outlet />
    </div>
  );
}
