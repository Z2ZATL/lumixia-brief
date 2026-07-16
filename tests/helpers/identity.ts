import { HttpError } from '../../server/http.js';
import type { IdentityVerifier, VerifiedIdentity } from '../../server/security/identity.js';

const owners: Record<string, string> = {
  'test-user-a': 'user-a',
  'test-user-b': 'user-b',
};

export class TestIdentityVerifier implements IdentityVerifier {
  async verify(bearerToken: string, signal: AbortSignal): Promise<VerifiedIdentity> {
    if (signal.aborted || bearerToken === 'test-unavailable') {
      throw new HttpError(503, 'AUTH_PROVIDER_UNAVAILABLE', 'Identity verification unavailable.');
    }
    if (bearerToken === 'test-aal1') {
      throw new HttpError(403, 'MFA_REQUIRED', 'Complete TOTP verification before continuing.');
    }
    if (bearerToken === 'test-expired') {
      throw new HttpError(401, 'AUTH_SESSION_EXPIRED', 'Your session expired. Sign in again.');
    }
    const userId = owners[bearerToken];
    if (!userId) throw new HttpError(401, 'AUTH_TOKEN_INVALID', 'Invalid authentication token.');
    return { userId, accessToken: bearerToken, aal: 'aal2' };
  }
}

export const userAHeaders = {
  authorization: 'Bearer test-user-a',
  origin: 'http://localhost:5173',
};

export const userBHeaders = {
  authorization: 'Bearer test-user-b',
  origin: 'http://localhost:5173',
};
