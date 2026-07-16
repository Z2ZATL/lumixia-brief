import type { ReactNode } from 'react';
import { useI18n } from '../i18n';
import { useAuth } from './useAuth';
import { AuthErrorScreen, EnrollmentScreen, SignInScreen, TotpChallengeScreen } from './screens';

export function AuthBoundary({ children }: { children: ReactNode }) {
  const auth = useAuth();
  const { t } = useI18n();
  if (auth.localDemo || auth.stage === 'authenticated_aal2') return children;
  if (auth.stage === 'signed_out') return <SignInScreen />;
  if (auth.stage === 'mfa_enrollment_required') return <EnrollmentScreen />;
  if (auth.stage === 'mfa_challenge_required') return <TotpChallengeScreen />;
  if (auth.stage === 'recoverable_error') return <AuthErrorScreen />;
  return (
    <div className="center-stage">
      <div className="spinner" role="status" aria-label={t('loading')} />
    </div>
  );
}
