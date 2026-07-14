import { LocaleSwitch, Logo } from '../components/Layout';
import { Hero, Principles, PrivacyBand } from '../features/landing/LandingSections';
import { useI18n } from '../i18n';

export function Landing() {
  const { t } = useI18n();
  return (
    <div className="landing">
      <header className="landing-nav">
        <Logo />
        <LocaleSwitch />
      </header>
      <main>
        <Hero t={t} />
        <Principles t={t} />
        <PrivacyBand t={t} />
      </main>
      <footer>
        <Logo />
        <span>{t('builtWith')}</span>
      </footer>
    </div>
  );
}
