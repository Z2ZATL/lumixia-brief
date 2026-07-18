import { randomBytes } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { loadConfig } from '../../server/config.js';
import { HttpError } from '../../server/http.js';
import { decryptSecret, encryptSecret } from '../../server/security/encryption.js';
import { securityHeaders } from '../../server/security/headers.js';
import {
  LocalDemoIdentityVerifier,
  SupabaseIdentityVerifier,
} from '../../server/security/identity.js';
import { sanitizeTelemetryText } from '../../shared/telemetry.js';

const mocks = vi.hoisted(() => ({ getClaims: vi.fn(), rpc: vi.fn() }));
vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({ auth: { getClaims: mocks.getClaims }, rpc: mocks.rpc })),
}));

const claims = {
  iss: 'https://example.supabase.co/auth/v1',
  sub: '11111111-1111-4111-8111-111111111111',
  aud: 'authenticated',
  exp: Math.floor(Date.now() / 1000) + 3600,
  iat: Math.floor(Date.now() / 1000),
  role: 'authenticated',
  aal: 'aal2',
  session_id: 'session-id',
};

describe('security primitives', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getClaims.mockResolvedValue({
      data: { claims, header: { alg: 'ES256' }, signature: new Uint8Array() },
      error: null,
    });
    mocks.rpc.mockResolvedValue({ data: true, error: null });
  });

  it('encrypts Notion tokens with authenticated AES-256-GCM', () => {
    const key = randomBytes(32).toString('base64');
    const encrypted = encryptSecret('secret-token', key);
    expect(encrypted).not.toContain('secret-token');
    expect(decryptSecret(encrypted, key)).toBe('secret-token');
    const replacement = encrypted.endsWith('x') ? 'y' : 'x';
    expect(() => decryptSecret(`${encrypted.slice(0, -1)}${replacement}`, key)).toThrow();
  });

  it('rejects invalid encryption keys and malformed token envelopes', () => {
    const key = randomBytes(32).toString('base64');
    expect(() => encryptSecret('secret-token', Buffer.alloc(31).toString('base64'))).toThrow(
      'exactly 32 bytes',
    );
    expect(() => decryptSecret('v2.iv.tag.data', key)).toThrow('Invalid encrypted envelope');
    expect(() => decryptSecret('v1.iv.tag', key)).toThrow('Invalid encrypted envelope');
    expect(() => decryptSecret('v1..tag.data', key)).toThrow('Invalid encrypted envelope');
    expect(() => decryptSecret('v1.iv..data', key)).toThrow('Invalid encrypted envelope');
  });

  it('accepts only a verified Supabase AAL2 access token', async () => {
    const verifier = new SupabaseIdentityVerifier('https://example.supabase.co', 'publishable-key');
    await expect(verifier.verify('valid-token', new AbortController().signal)).resolves.toEqual({
      userId: claims.sub,
      accessToken: 'valid-token',
      aal: 'aal2',
    });
    mocks.getClaims.mockResolvedValueOnce({
      data: { claims: { ...claims, aal: 'aal1' } },
      error: null,
    });
    await expectHttpError(
      verifier.verify('aal1-token', new AbortController().signal),
      403,
      'MFA_REQUIRED',
    );
    mocks.getClaims.mockResolvedValueOnce({
      data: {
        claims: { ...claims, client_id: 'codex-client_opaque.1' },
      },
      error: null,
    });
    await expectHttpError(
      verifier.verify('oauth-browser-token', new AbortController().signal),
      403,
      'MCP_TOKEN_NOT_ALLOWED',
    );
  });

  it('accepts an AAL1 OAuth token only for MCP after an active AAL2 consent grant', async () => {
    const verifier = new SupabaseIdentityVerifier('https://example.supabase.co', 'publishable-key');
    mocks.getClaims.mockResolvedValue({
      data: {
        claims: { ...claims, aal: 'aal1', client_id: 'codex-client_opaque.1' },
      },
      error: null,
    });
    await expect(
      verifier.verify('oauth-token', new AbortController().signal, 'mcp'),
    ).resolves.toEqual({
      userId: claims.sub,
      accessToken: 'oauth-token',
      aal: 'aal2',
      clientId: 'codex-client_opaque.1',
    });
    expect(mocks.rpc).toHaveBeenCalledWith('verify_codex_oauth_grant');
    const clientOptions = vi.mocked(createClient).mock.lastCall?.[2];
    expect(clientOptions?.global?.headers).toEqual({ Authorization: 'Bearer oauth-token' });

    mocks.rpc.mockResolvedValueOnce({ data: false, error: null });
    await expectHttpError(
      verifier.verify('oauth-token', new AbortController().signal, 'mcp'),
      403,
      'MCP_MFA_GRANT_REQUIRED',
    );

    mocks.getClaims.mockResolvedValueOnce({ data: { claims }, error: null });
    await expectHttpError(
      verifier.verify('browser-token', new AbortController().signal, 'mcp'),
      401,
      'MCP_OAUTH_REQUIRED',
    );
  });

  it('rejects wrong issuer, audience, role, subject, and expired sessions', async () => {
    const verifier = new SupabaseIdentityVerifier('https://example.supabase.co', 'publishable-key');
    for (const invalid of [
      { ...claims, iss: 'https://evil.example/auth/v1' },
      { ...claims, aud: 'another-service' },
      { ...claims, role: 'anon' },
      { ...claims, sub: 'not-a-uuid' },
    ]) {
      mocks.getClaims.mockResolvedValueOnce({ data: { claims: invalid }, error: null });
      await expectHttpError(
        verifier.verify('invalid-token', new AbortController().signal),
        401,
        'AUTH_TOKEN_INVALID',
      );
    }
    await expectHttpError(
      verifier.verify(expiredToken(), new AbortController().signal),
      401,
      'AUTH_SESSION_EXPIRED',
    );
  });

  it('fails closed when identity verification is unavailable', async () => {
    const verifier = new SupabaseIdentityVerifier('https://example.supabase.co', 'publishable-key');
    mocks.getClaims.mockRejectedValueOnce(new TypeError('network unavailable'));
    await expectHttpError(
      verifier.verify('valid-token', new AbortController().signal),
      503,
      'AUTH_PROVIDER_UNAVAILABLE',
    );

    const alreadyAborted = new AbortController();
    alreadyAborted.abort();
    await expectHttpError(
      verifier.verify('valid-token', alreadyAborted.signal),
      503,
      'AUTH_PROVIDER_UNAVAILABLE',
    );

    const abortedDuringVerification = new AbortController();
    mocks.getClaims.mockImplementationOnce(async () => {
      abortedDuringVerification.abort();
      return { data: { claims }, error: null };
    });
    await expectHttpError(
      verifier.verify('valid-token', abortedDuringVerification.signal),
      503,
      'AUTH_PROVIDER_UNAVAILABLE',
    );
  });

  it('uses a fixed local identity and rejects an aborted local request', async () => {
    const verifier = new LocalDemoIdentityVerifier();
    await expect(verifier.verify('', new AbortController().signal)).resolves.toEqual({
      userId: '00000000-0000-4000-8000-000000000001',
      accessToken: 'local-demo',
      aal: 'aal2',
    });
    const controller = new AbortController();
    controller.abort();
    await expectHttpError(verifier.verify('', controller.signal), 503, 'AUTH_PROVIDER_UNAVAILABLE');
  });

  it('maps malformed tokens and unexpected claim failures to invalid-token responses', async () => {
    const verifier = new SupabaseIdentityVerifier('https://example.supabase.co', 'publishable-key');
    mocks.getClaims.mockRejectedValueOnce(new Error('verification rejected'));
    await expectHttpError(
      verifier.verify('invalid-token', new AbortController().signal),
      401,
      'AUTH_TOKEN_INVALID',
    );

    mocks.getClaims.mockResolvedValueOnce({ data: null, error: new Error('invalid') });
    await expectHttpError(
      verifier.verify('header.%%%not-base64%%%.signature', new AbortController().signal),
      401,
      'AUTH_TOKEN_INVALID',
    );
  });

  it('constructs a legacy-provider-free Supabase CSP policy', () => {
    const middleware = securityHeaders(
      loadConfig({
        NODE_ENV: 'test',
        AUTH_MODE: 'supabase',
        VITE_AUTH_MODE: 'supabase',
        VITE_SUPABASE_URL: 'https://example.supabase.co',
        VITE_SUPABASE_PUBLISHABLE_KEY: 'publishable-key',
      }),
    );
    expect(middleware).toBeTypeOf('function');
  });

  it('removes query secrets, OAuth values, and record identifiers from telemetry', () => {
    expect(
      sanitizeTelemetryText(
        '/api/projects/11111111-1111-4111-8111-111111111111?code=secret&state=secret',
      ),
    ).toBe('/api/projects/:id');
    expect(sanitizeTelemetryText('OAuth code=secret state=secret')).toBe(
      'OAuth code=[redacted] state=[redacted]',
    );
  });
});

async function expectHttpError(promise: Promise<unknown>, status: number, code: string) {
  try {
    await promise;
    throw new Error('Expected an HttpError.');
  } catch (error) {
    expect(error).toBeInstanceOf(HttpError);
    expect(error).toMatchObject({ status, code });
  }
}

function expiredToken(): string {
  const header = Buffer.from(JSON.stringify({ alg: 'ES256' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({ exp: 1 })).toString('base64url');
  return `${header}.${payload}.signature`;
}
