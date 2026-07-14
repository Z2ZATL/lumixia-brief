import { SignIn, UserProfile, useAuth, useUser } from '@clerk/react';
import type { ReactNode } from 'react';
import { useI18n } from './i18n';

export function AuthBoundary({ children, localMode }: { children: ReactNode; localMode: boolean }) {
  if (localMode) return children;
  return <ClerkBoundary>{children}</ClerkBoundary>;
}

function ClerkBoundary({ children }: { children: ReactNode }) {
  const { isLoaded, isSignedIn } = useAuth();
  const { user } = useUser();
  const { t } = useI18n();
  if (!isLoaded)
    return (
      <div className="center-stage">
        <div className="spinner" aria-label={t('loading')} />
      </div>
    );
  if (!isSignedIn)
    return (
      <div className="auth-stage">
        <SignIn routing="hash" />
      </div>
    );
  if (!user?.twoFactorEnabled) {
    return (
      <main className="security-setup">
        <section className="security-copy">
          <span className="eyebrow">{t('aal2Required')}</span>
          <h1>{t('secureSetup')}</h1>
          <p>{t('secureBody')}</p>
        </section>
        <UserProfile routing="hash" />
      </main>
    );
  }
  return children;
}
