import { randomBytes } from 'node:crypto';
import type { Request, Response } from 'express';
import { getAuth } from '@clerk/express';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { loadConfig } from '../../server/config.js';
import { hasMfaClaim, requireMfa } from '../../server/http.js';
import { decryptSecret, encryptSecret } from '../../server/security/encryption.js';
import { sanitizeTelemetryText } from '../../shared/telemetry.js';

vi.mock('@clerk/express', () => ({ getAuth: vi.fn() }));

describe('security primitives', () => {
  beforeEach(() => vi.clearAllMocks());

  it('encrypts Notion tokens with authenticated AES-256-GCM', () => {
    const key = randomBytes(32).toString('base64');
    const encrypted = encryptSecret('secret-token', key);
    expect(encrypted).not.toContain('secret-token');
    expect(decryptSecret(encrypted, key)).toBe('secret-token');
    expect(() => decryptSecret(`${encrypted.slice(0, -1)}x`, key)).toThrow();
  });

  it('accepts AAL2/fva MFA and rejects AAL1', () => {
    expect(hasMfaClaim({ aal: 'aal2' })).toBe(true);
    expect(hasMfaClaim({ fva: [4, 0] })).toBe(true);
    expect(hasMfaClaim({ fva: [4, -1], aal: 'aal1' })).toBe(false);
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
