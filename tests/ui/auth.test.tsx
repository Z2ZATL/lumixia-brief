import type { Factor, Session, SupabaseClient } from '@supabase/supabase-js';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { StrictMode, type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthBoundary, AuthContext, AuthProvider, type AuthContextValue } from '../../src/auth';
import { I18nProvider } from '../../src/i18n';
import { api } from '../../src/lib/api';
import { AuthCallback } from '../../src/pages/AuthCallback';
import { NotionCallback } from '../../src/pages/NotionCallback';
import { Security } from '../../src/pages/Security';

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  listFactors: vi.fn(),
  getAal: vi.fn(),
  enroll: vi.fn(),
  challenge: vi.fn(),
  verify: vi.fn(),
  unenroll: vi.fn(),
  signInWithOAuth: vi.fn(),
  exchangeCodeForSession: vi.fn(),
  signOut: vi.fn(),
  onAuthStateChange: vi.fn(),
  getAccessToken: vi.fn(),
  refreshAccessToken: vi.fn(),
  expireBrowserSession: vi.fn(),
}));

const client = {
  auth: {
    getSession: mocks.getSession,
    mfa: {
      listFactors: mocks.listFactors,
      getAuthenticatorAssuranceLevel: mocks.getAal,
      enroll: mocks.enroll,
      challenge: mocks.challenge,
      verify: mocks.verify,
      unenroll: mocks.unenroll,
    },
    signInWithOAuth: mocks.signInWithOAuth,
    exchangeCodeForSession: mocks.exchangeCodeForSession,
    signOut: mocks.signOut,
    onAuthStateChange: mocks.onAuthStateChange,
  },
} as unknown as SupabaseClient;

vi.mock('../../src/auth/client', () => ({
  authMode: 'supabase',
  isLocalDemo: false,
  authExpiredEvent: 'lumixia:auth-expired',
  clearAuthCache: vi.fn(),
  getSupabaseBrowserClient: () => client,
  rememberReturnPath: vi.fn(),
  consumeReturnPath: () => '/projects',
  getAccessToken: mocks.getAccessToken,
  refreshAccessToken: mocks.refreshAccessToken,
  expireBrowserSession: mocks.expireBrowserSession,
}));

const session = {
  access_token: 'access-token',
  user: { id: '11111111-1111-4111-8111-111111111111', user_metadata: {} },
} as unknown as Session;

const primaryFactor = {
  id: 'factor-primary',
  factor_type: 'totp',
  friendly_name: 'Primary authenticator',
  status: 'verified',
  created_at: '2026-07-16T00:00:00.000Z',
  updated_at: '2026-07-16T00:00:00.000Z',
} satisfies Factor<'totp', 'verified'>;

describe('Supabase authentication UI', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.onAuthStateChange.mockReturnValue({
      data: { subscription: { unsubscribe: vi.fn() } },
    });
    mocks.getSession.mockResolvedValue({ data: { session: null }, error: null });
    mocks.signInWithOAuth.mockResolvedValue({
      data: { provider: 'google', url: 'https://google.test' },
      error: null,
    });
    mocks.unenroll.mockResolvedValue({ data: {}, error: null });
  });

  it('shows a Google-only sign-in gate when no session exists', async () => {
    renderAuth(<div>Protected workspace</div>);
    const button = await screen.findByRole('button', { name: /continue with google/i });
    await userEvent.click(button);
    expect(mocks.signInWithOAuth).toHaveBeenCalledWith({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
        scopes: 'openid email profile',
      },
    });
    expect(screen.queryByText('Protected workspace')).not.toBeInTheDocument();
  });

  it('enrolls and verifies the mandatory primary TOTP before rendering protected content', async () => {
    mocks.getSession.mockResolvedValue({ data: { session }, error: null });
    mocks.getAal
      .mockResolvedValueOnce({ data: { currentLevel: 'aal1', nextLevel: 'aal1' }, error: null })
      .mockResolvedValueOnce({ data: { currentLevel: 'aal2', nextLevel: 'aal2' }, error: null });
    mocks.listFactors
      .mockResolvedValueOnce({ data: { totp: [], all: [] }, error: null })
      .mockResolvedValueOnce({ data: { totp: [], all: [] }, error: null })
      .mockResolvedValueOnce({
        data: { totp: [primaryFactor], all: [primaryFactor] },
        error: null,
      });
    mocks.enroll.mockResolvedValue({
      data: {
        id: 'new-factor',
        totp: { qr_code: '<svg></svg>', secret: 'SAFE-TEST-SECRET', uri: 'otpauth://test' },
      },
      error: null,
    });
    mocks.challenge.mockResolvedValue({ data: { id: 'challenge' }, error: null });
    mocks.verify.mockResolvedValue({ data: { session }, error: null });
    renderAuth(<div>Protected workspace</div>);
    await userEvent.click(
      await screen.findByRole('button', { name: /set up your authenticator/i }),
    );
    expect(await screen.findByText('SAFE-TEST-SECRET')).toBeVisible();
    await userEvent.type(screen.getByLabelText(/six-digit authenticator code/i), '123456');
    await userEvent.click(screen.getByRole('button', { name: /verify and continue/i }));
    expect(await screen.findByText('Protected workspace')).toBeVisible();
    expect(mocks.verify).toHaveBeenCalledWith({
      factorId: 'new-factor',
      challengeId: 'challenge',
      code: '123456',
    });
  });

  it('challenges an existing factor and protects the last verified authenticator', async () => {
    mocks.getSession.mockResolvedValue({ data: { session }, error: null });
    mocks.getAal
      .mockResolvedValueOnce({ data: { currentLevel: 'aal1', nextLevel: 'aal2' }, error: null })
      .mockResolvedValueOnce({ data: { currentLevel: 'aal2', nextLevel: 'aal2' }, error: null });
    mocks.listFactors.mockResolvedValue({
      data: { totp: [primaryFactor], all: [primaryFactor] },
      error: null,
    });
    mocks.challenge.mockResolvedValue({ data: { id: 'challenge' }, error: null });
    mocks.verify.mockResolvedValue({ data: { session }, error: null });
    renderAuth(<div>Protected workspace</div>);
    await userEvent.type(await screen.findByLabelText(/six-digit authenticator code/i), '654321');
    await userEvent.click(screen.getByRole('button', { name: /verify and continue/i }));
    expect(await screen.findByText('Protected workspace')).toBeVisible();

    renderSecurity(oneFactorContext());
    expect(screen.getByRole('button', { name: /remove authenticator/i })).toBeDisabled();
  });

  it('refreshes an expired bearer token once and replays the protected request safely', async () => {
    mocks.getAccessToken.mockResolvedValue('expired-access-token');
    mocks.refreshAccessToken.mockResolvedValue('fresh-access-token');
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ error: { code: 'AUTH_SESSION_EXPIRED', message: 'expired' } }),
          { status: 401 },
        ),
      )
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    await expect(api<{ ok: boolean }>('/protected')).resolves.toEqual({ ok: true });
    expect(mocks.refreshAccessToken).toHaveBeenCalledOnce();
    const secondRequest = vi.mocked(fetch).mock.calls[1]?.[1];
    expect(new Headers(secondRequest?.headers).get('authorization')).toBe(
      'Bearer fresh-access-token',
    );
  });

  it('clears an expired session when refresh fails without retrying in a loop', async () => {
    mocks.getAccessToken.mockResolvedValue('expired-access-token');
    mocks.refreshAccessToken.mockRejectedValue(new Error('refresh rejected'));
    mocks.expireBrowserSession.mockResolvedValue(undefined);
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(
        JSON.stringify({ error: { code: 'AUTH_SESSION_EXPIRED', message: 'expired' } }),
        { status: 401 },
      ),
    );
    await expect(api('/protected')).rejects.toMatchObject({
      status: 401,
      code: 'AUTH_REQUIRED',
    });
    expect(mocks.expireBrowserSession).toHaveBeenCalledOnce();
    expect(fetch).toHaveBeenCalledOnce();
  });

  it('exchanges the PKCE callback only once under Strict Mode and navigates internally', async () => {
    window.history.replaceState({}, '', '/auth/callback?code=synthetic-code');
    const completeOAuthCallback = vi.fn().mockResolvedValue('/projects');
    render(
      <StrictMode>
        <MemoryRouter initialEntries={['/auth/callback']}>
          <I18nProvider>
            <AuthContext.Provider
              value={{ ...oneFactorContext(), stage: 'oauth_callback', completeOAuthCallback }}
            >
              <Routes>
                <Route path="/auth/callback" element={<AuthCallback />} />
                <Route path="/projects" element={<div>Projects destination</div>} />
              </Routes>
            </AuthContext.Provider>
          </I18nProvider>
        </MemoryRouter>
      </StrictMode>,
    );
    expect(await screen.findByText('Projects destination')).toBeVisible();
    expect(completeOAuthCallback).toHaveBeenCalledOnce();
  });

  it('posts the Notion callback once under Strict Mode and removes secrets from the URL', async () => {
    window.history.replaceState(
      {},
      '',
      '/notion/callback?code=synthetic-code&state=synthetic-state',
    );
    mocks.getAccessToken.mockResolvedValue('access-token');
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ connected: true, cancelled: false }), { status: 200 }),
    );
    render(
      <StrictMode>
        <MemoryRouter initialEntries={['/notion/callback']}>
          <I18nProvider>
            <AuthContext.Provider value={oneFactorContext()}>
              <Routes>
                <Route path="/notion/callback" element={<NotionCallback />} />
                <Route path="/settings" element={<div>Settings destination</div>} />
              </Routes>
            </AuthContext.Provider>
          </I18nProvider>
        </MemoryRouter>
      </StrictMode>,
    );
    expect(await screen.findByText('Settings destination')).toBeVisible();
    expect(fetch).toHaveBeenCalledOnce();
    expect(window.location.search).toBe('');
  });
});

function renderAuth(children: ReactNode) {
  return render(
    <MemoryRouter>
      <I18nProvider>
        <AuthProvider>
          <AuthBoundary>{children}</AuthBoundary>
        </AuthProvider>
      </I18nProvider>
    </MemoryRouter>,
  );
}

function renderSecurity(value: AuthContextValue) {
  return render(
    <MemoryRouter>
      <I18nProvider>
        <AuthContext.Provider value={value}>
          <Security />
        </AuthContext.Provider>
      </I18nProvider>
    </MemoryRouter>,
  );
}

function oneFactorContext(): AuthContextValue {
  return {
    stage: 'authenticated_aal2',
    user: session.user,
    factors: [primaryFactor],
    enrollment: null,
    error: '',
    busy: false,
    localDemo: false,
    signIn: vi.fn(),
    signOut: vi.fn(),
    retry: vi.fn(),
    completeOAuthCallback: vi.fn(),
    startEnrollment: vi.fn(),
    verifyEnrollment: vi.fn(),
    verifyFactor: vi.fn(),
    removeFactor: vi.fn(),
  };
}
