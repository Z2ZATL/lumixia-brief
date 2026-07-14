import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { hasMfaClaim } from '../../server/http.js';
import { decryptSecret, encryptSecret } from '../../server/security/encryption.js';

describe('security primitives', () => {
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
});
