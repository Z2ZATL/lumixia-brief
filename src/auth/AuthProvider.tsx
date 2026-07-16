import type { Factor, SupabaseClient, User } from '@supabase/supabase-js';
import { createContext, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  authExpiredEvent,
  clearAuthCache,
  consumeReturnPath,
  getSupabaseBrowserClient,
  isLocalDemo,
  rememberReturnPath,
} from './client';
import type { AuthContextValue, AuthProviderProps, AuthStage, TotpEnrollment } from './types';

export const AuthContext = createContext<AuthContextValue | null>(null);

interface AuthSnapshot {
  stage: AuthStage;
  user: User | null;
  factors: Factor<'totp', 'verified'>[];
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [stage, setStage] = useState<AuthStage>(isLocalDemo ? 'authenticated_aal2' : 'booting');
  const [user, setUser] = useState<User | null>(null);
  const [factors, setFactors] = useState<Factor<'totp', 'verified'>[]>([]);
  const [enrollment, setEnrollment] = useState<TotpEnrollment | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const active = useRef(true);
  const syncSequence = useRef(0);

  const syncState = useCallback(async () => {
    if (isLocalDemo) return;
    const sequence = ++syncSequence.current;
    try {
      const snapshot = await resolveSnapshot(getSupabaseBrowserClient());
      if (!active.current || sequence !== syncSequence.current) return;
      applySnapshot(snapshot, setStage, setUser, setFactors);
      setError('');
    } catch {
      if (!active.current || sequence !== syncSequence.current) return;
      setError('The secure session could not be restored. Try again.');
      setStage('recoverable_error');
    }
  }, []);

  useEffect(() => {
    if (isLocalDemo) return undefined;
    active.current = true;
    queueMicrotask(() => void syncState());
    const client = getSupabaseBrowserClient();
    const { data } = client.auth.onAuthStateChange(() => queueMicrotask(() => void syncState()));
    const handleExpired = () => {
      syncSequence.current += 1;
      setUser(null);
      setFactors([]);
      setEnrollment(null);
      setError('Your session expired. Sign in again to continue.');
      setStage('signed_out');
    };
    window.addEventListener(authExpiredEvent, handleExpired);
    return () => {
      active.current = false;
      syncSequence.current += 1;
      window.removeEventListener(authExpiredEvent, handleExpired);
      data.subscription.unsubscribe();
    };
  }, [syncState]);

  const value = useMemo<AuthContextValue>(
    () => ({
      stage,
      user,
      factors,
      enrollment,
      error,
      busy,
      localDemo: isLocalDemo,
      signIn: () => signIn(setBusy, setError),
      signOut: () => signOut(setBusy, setError, setStage, setUser, setFactors),
      retry: syncState,
      completeOAuthCallback: (search) =>
        completeOAuthCallback(search, setStage, setError, syncState),
      startEnrollment: (friendlyName) =>
        startEnrollment(friendlyName, factors, setBusy, setError, setEnrollment, setStage),
      verifyEnrollment: (code) =>
        verifyEnrollment(code, enrollment, setBusy, setError, setEnrollment, syncState),
      verifyFactor: (factorId, code) => verifyFactor(factorId, code, setBusy, setError, syncState),
      removeFactor: (factorId) => removeFactor(factorId, factors, setBusy, setError, syncState),
    }),
    [busy, enrollment, error, factors, stage, syncState, user],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

async function resolveSnapshot(client: SupabaseClient): Promise<AuthSnapshot> {
  const sessionResult = await client.auth.getSession();
  if (sessionResult.error) throw sessionResult.error;
  const session = sessionResult.data.session;
  if (!session) return { stage: 'signed_out', user: null, factors: [] };
  const [factorResult, aalResult] = await Promise.all([
    client.auth.mfa.listFactors(),
    client.auth.mfa.getAuthenticatorAssuranceLevel(session.access_token),
  ]);
  if (factorResult.error) throw factorResult.error;
  if (aalResult.error) throw aalResult.error;
  const factors = factorResult.data.totp;
  const stage = assuranceStage(aalResult.data.currentLevel, factors.length);
  return { stage, user: session.user, factors };
}

function assuranceStage(level: string | null, factorCount: number): AuthStage {
  if (level === 'aal2') return 'authenticated_aal2';
  return factorCount ? 'mfa_challenge_required' : 'mfa_enrollment_required';
}

function applySnapshot(
  snapshot: AuthSnapshot,
  setStage: (stage: AuthStage) => void,
  setUser: (user: User | null) => void,
  setFactors: (factors: Factor<'totp', 'verified'>[]) => void,
): void {
  setStage(snapshot.stage);
  setUser(snapshot.user);
  setFactors(snapshot.factors);
}

async function signIn(setBusy: (busy: boolean) => void, setError: (error: string) => void) {
  setBusy(true);
  setError('');
  try {
    rememberReturnPath(window.location.pathname);
    const redirectTo = `${window.location.origin}/auth/callback`;
    const { error } = await getSupabaseBrowserClient().auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo, scopes: 'openid email profile' },
    });
    if (error) throw error;
  } catch {
    setError('Google sign-in could not start. Try again.');
    setBusy(false);
  }
}

async function signOut(
  setBusy: (busy: boolean) => void,
  setError: (error: string) => void,
  setStage: (stage: AuthStage) => void,
  setUser: (user: User | null) => void,
  setFactors: (factors: Factor<'totp', 'verified'>[]) => void,
) {
  if (isLocalDemo) return;
  setBusy(true);
  setError('');
  const client = getSupabaseBrowserClient();
  try {
    const result = await client.auth.signOut();
    if (result.error) await client.auth.signOut({ scope: 'local' });
  } catch {
    await client.auth.signOut({ scope: 'local' }).catch(() => undefined);
  } finally {
    clearAuthCache();
    setUser(null);
    setFactors([]);
    setStage('signed_out');
    setBusy(false);
  }
}

async function completeOAuthCallback(
  search: string,
  setStage: (stage: AuthStage) => void,
  setError: (error: string) => void,
  syncState: () => Promise<void>,
): Promise<string | null> {
  setStage('oauth_callback');
  const params = new URLSearchParams(search);
  const code = params.get('code');
  const denied = params.get('error') === 'access_denied';
  window.history.replaceState({}, '', '/auth/callback');
  if (denied || !code) {
    setError(denied ? 'Google sign-in was cancelled.' : 'The sign-in callback is invalid.');
    setStage('recoverable_error');
    return null;
  }
  try {
    const { error } = await getSupabaseBrowserClient().auth.exchangeCodeForSession(code);
    if (error) throw error;
    await syncState();
    return consumeReturnPath();
  } catch {
    setError('The secure sign-in session could not be completed. Try again.');
    setStage('recoverable_error');
    return null;
  }
}

async function startEnrollment(
  friendlyName: string,
  factors: Factor<'totp', 'verified'>[],
  setBusy: (busy: boolean) => void,
  setError: (error: string) => void,
  setEnrollment: (enrollment: TotpEnrollment | null) => void,
  setStage: (stage: AuthStage) => void,
) {
  if (factors.length >= 2) return;
  setBusy(true);
  setError('');
  const client = getSupabaseBrowserClient();
  try {
    await removeUnverifiedTotp(client);
    const { data, error } = await client.auth.mfa.enroll({
      factorType: 'totp',
      friendlyName,
      issuer: 'Lumixia Brief',
    });
    if (error) throw error;
    setEnrollment({
      factorId: data.id,
      friendlyName,
      qrCode: data.totp.qr_code,
      secret: data.totp.secret,
    });
    setStage('mfa_enrollment_required');
  } catch {
    setError('Authenticator setup could not start. Try again.');
  } finally {
    setBusy(false);
  }
}

async function removeUnverifiedTotp(client: SupabaseClient): Promise<void> {
  const { data, error } = await client.auth.mfa.listFactors();
  if (error) throw error;
  const pending = data.all.filter(
    (factor) => factor.factor_type === 'totp' && factor.status === 'unverified',
  );
  for (const factor of pending) {
    const result = await client.auth.mfa.unenroll({ factorId: factor.id });
    if (result.error) throw result.error;
  }
}

async function verifyEnrollment(
  code: string,
  enrollment: TotpEnrollment | null,
  setBusy: (busy: boolean) => void,
  setError: (error: string) => void,
  setEnrollment: (enrollment: TotpEnrollment | null) => void,
  syncState: () => Promise<void>,
) {
  if (!enrollment) return;
  setBusy(true);
  setError('');
  try {
    await challengeAndVerify(enrollment.factorId, code);
    setEnrollment(null);
    await syncState();
  } catch {
    setError('The verification code was not accepted. Check the code and try again.');
  } finally {
    setBusy(false);
  }
}

async function verifyFactor(
  factorId: string,
  code: string,
  setBusy: (busy: boolean) => void,
  setError: (error: string) => void,
  syncState: () => Promise<void>,
) {
  setBusy(true);
  setError('');
  try {
    await challengeAndVerify(factorId, code);
    await syncState();
  } catch {
    setError('The verification code was not accepted. Check the code and try again.');
  } finally {
    setBusy(false);
  }
}

async function challengeAndVerify(factorId: string, code: string): Promise<void> {
  const client = getSupabaseBrowserClient();
  const challenge = await client.auth.mfa.challenge({ factorId });
  if (challenge.error) throw challenge.error;
  const verified = await client.auth.mfa.verify({
    factorId,
    challengeId: challenge.data.id,
    code: code.trim(),
  });
  if (verified.error) throw verified.error;
}

async function removeFactor(
  factorId: string,
  factors: Factor<'totp', 'verified'>[],
  setBusy: (busy: boolean) => void,
  setError: (error: string) => void,
  syncState: () => Promise<void>,
) {
  if (factors.length <= 1) {
    setError('Add and verify a replacement before removing the last authenticator.');
    return;
  }
  setBusy(true);
  setError('');
  try {
    const { error } = await getSupabaseBrowserClient().auth.mfa.unenroll({ factorId });
    if (error) throw error;
    await syncState();
  } catch {
    setError('The authenticator could not be removed. Try again.');
  } finally {
    setBusy(false);
  }
}
