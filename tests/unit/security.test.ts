import { randomBytes } from 'node:crypto';
import type { Request, Response } from 'express';
import { getAuth } from '@clerk/express';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { loadConfig } from '../../server/config.js';
import { hasMfaClaim, requireMfa } from '../../server/http.js';
import { decryptSecret, encryptSecret } from '../../server/security/encryption.js';
import { securityHeaders } from '../../server/security/headers.js';
import { sanitizeTelemetryText } from '../../shared/telemetry.js';

vi.mock('@clerk/express', () => ({ getAuth: vi.fn() }));

describe('security primitives', () => {
  beforeEach(() => vi.clearAllMocks());

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

  it('accepts AAL2/fva MFA and rejects AAL1', () => {
    expect(hasMfaClaim({ aal: 'aal2' })).toBe(true);
    expect(hasMfaClaim({ fva: [4, 0] })).toBe(true);
    expect(hasMfaClaim({ fva: [4, -1], aal: 'aal1' })).toBe(false);
    expect(hasMfaClaim({ fva: [4] })).toBe(false);
    expect(hasMfaClaim({ fva: [4, 'not-a-number'] })).toBe(false);
    expect(hasMfaClaim({})).toBe(false);
  });

  it('constructs development and production CSP policies', () => {
    expect(
      securityHeaders(loadConfig({ NODE_ENV: 'test', MODEL_PROVIDER_MODE: 'mock' })),
    ).toBeTypeOf('function');
    expect(
      securityHeaders(
        loadConfig({
          NODE_ENV: 'test',
          APP_ENV: 'production',
          APP_URL: 'https://brief.example.com',
          VITE_CLERK_PUBLISHABLE_KEY: 'pk_live_example',
          CLERK_SECRET_KEY: 'sk_live_example',
          SUPABASE_URL: 'https://example.supabase.co',
          SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_example',
          DATA_MODE: 'supabase',
          MODEL_PROVIDER_MODE: 'disabled',
          NOTION_PROVIDER_MODE: 'live',
          NOTION_CLIENT_ID: 'notion-client',
          NOTION_CLIENT_SECRET: 'notion-secret',
          NOTION_REDIRECT_URI: 'https://brief.example.com/api/notion/callback',
          OAUTH_STATE_SECRET: 's'.repeat(32),
          TOKEN_ENCRYPTION_KEY: randomBytes(32).toString('base64'),
        }),
      ),
    ).toBeTypeOf('function');
  });

  it('passes the native Clerk session token to Supabase without a deprecated JWT template', async () => {
    const getToken = vi.fn().mockResolvedValue('native-session-token');
    vi.mocked(getAuth).mockReturnValue({
      userId: 'user_test',
      sessionClaims: { fva: [4, 0] },
      getToken,
    } as unknown as ReturnType<typeof getAuth>);
    const request = {} as Request;
    const next = vi.fn();
    const middleware = requireMfa(loadConfig({ NODE_ENV: 'development', APP_ENV: 'local' }));

    await middleware(request, {} as Response, next);

    expect(getToken).toHaveBeenCalledOnce();
    expect(getToken).toHaveBeenCalledWith();
    expect(request.authContext).toEqual({
      userId: 'user_test',
      supabaseToken: 'native-session-token',
      aal: 'aal2',
    });
    expect(next).toHaveBeenCalledWith();
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
