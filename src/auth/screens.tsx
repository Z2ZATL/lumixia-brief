import { useState, type FormEvent, type ReactNode } from 'react';
import { Logo, LocaleSwitch } from '../components/Layout';
import { useI18n } from '../i18n';
import { useAuth } from './useAuth';

export function SignInScreen() {
  const auth = useAuth();
  const { t } = useI18n();
  return (
    <main className="auth-shell">
      <header className="auth-header">
        <Logo />
        <LocaleSwitch />
      </header>
      <section className="auth-card">
        <span className="eyebrow">{t('privateWorkspace')}</span>
        <h1>{t('secureSetup')}</h1>
        <p>{t('googleOnly')}</p>
        {auth.error && (
          <div className="alert error" role="alert">
            {auth.error}
          </div>
        )}
        <button
          className="button primary full google-button"
          onClick={auth.signIn}
          disabled={auth.busy}
        >
          <span aria-hidden="true">G</span>
          {t('continueGoogle')}
        </button>
      </section>
    </main>
  );
}

export function EnrollmentScreen() {
  const auth = useAuth();
  const { t } = useI18n();
  if (!auth.enrollment) {
    const label = auth.factors.length ? t('backupAuthenticator') : t('primaryAuthenticator');
    return (
      <SecurityShell title={t('authenticatorSetup')} body={t('authenticatorSetupBody')}>
        <button
          className="button primary"
          onClick={() => auth.startEnrollment(label)}
          disabled={auth.busy}
        >
          {auth.factors.length ? t('addBackup') : t('authenticatorSetup')}
        </button>
      </SecurityShell>
    );
  }
  return (
    <SecurityShell title={t('authenticatorSetup')} body={t('authenticatorSetupBody')}>
      <div className="totp-enrollment">
        <img src={qrSource(auth.enrollment.qrCode)} alt={t('authenticatorSetup')} />
        <div className="manual-secret">
          <span>{t('manualSecret')}</span>
          <code>{auth.enrollment.secret}</code>
        </div>
        <CodeForm onSubmit={auth.verifyEnrollment} busy={auth.busy} />
      </div>
    </SecurityShell>
  );
}

export function TotpChallengeScreen() {
  const auth = useAuth();
  const { t } = useI18n();
  const [factorId, setFactorId] = useState(auth.factors[0]?.id ?? '');
  const selectedFactorId = auth.factors.some((factor) => factor.id === factorId)
    ? factorId
    : (auth.factors[0]?.id ?? '');
  return (
    <SecurityShell title={t('authenticatorChallenge')} body={t('authenticatorChallengeBody')}>
      {auth.factors.length > 1 && (
        <label className="field">
          <span>{t('authenticatorChoice')}</span>
          <select value={selectedFactorId} onChange={(event) => setFactorId(event.target.value)}>
            {auth.factors.map((factor, index) => (
              <option key={factor.id} value={factor.id}>
                {factor.friendly_name ??
                  (index ? t('backupAuthenticator') : t('primaryAuthenticator'))}
              </option>
            ))}
          </select>
        </label>
      )}
      <CodeForm onSubmit={(code) => auth.verifyFactor(selectedFactorId, code)} busy={auth.busy} />
    </SecurityShell>
  );
}

export function AuthErrorScreen() {
  const auth = useAuth();
  const { t } = useI18n();
  return (
    <SecurityShell title={t('authError')} body={auth.error}>
      <div className="auth-error-actions">
        <button className="button primary" onClick={auth.retry} disabled={auth.busy}>
          {t('authRetry')}
        </button>
        <button className="button ghost" onClick={auth.signOut} disabled={auth.busy}>
          {t('signOut')}
        </button>
      </div>
    </SecurityShell>
  );
}

function SecurityShell(props: { title: string; body: string; children: ReactNode }) {
  const auth = useAuth();
  return (
    <main className="security-setup">
      <section className="security-copy">
        <span className="eyebrow">AAL2 · TOTP</span>
        <h1>{props.title}</h1>
        <p>{props.body}</p>
        {auth.error && (
          <div className="alert error" role="alert">
            {auth.error}
          </div>
        )}
      </section>
      <section className="security-card">{props.children}</section>
    </main>
  );
}

function CodeForm(props: { onSubmit: (code: string) => Promise<void>; busy: boolean }) {
  const { t } = useI18n();
  const [code, setCode] = useState('');
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (code.length !== 6) return;
    await props.onSubmit(code);
  }
  return (
    <form className="totp-form" onSubmit={submit}>
      <label className="field">
        <span>{t('authenticatorCode')}</span>
        <input
          value={code}
          onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9]{6}"
          maxLength={6}
          required
        />
      </label>
      <button className="button primary full" disabled={props.busy || code.length !== 6}>
        {t('verifyContinue')}
      </button>
    </form>
  );
}

function qrSource(value: string): string {
  return value.startsWith('data:') ? value : `data:image/svg+xml;utf8,${encodeURIComponent(value)}`;
}
