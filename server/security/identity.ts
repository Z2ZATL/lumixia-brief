import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';
import type { AppConfig } from '../config.js';
import { HttpError } from '../http.js';

export interface VerifiedIdentity {
  userId: string;
  accessToken: string;
  aal: 'aal2';
}

export interface IdentityVerifier {
  verify(bearerToken: string, signal: AbortSignal): Promise<VerifiedIdentity>;
}

const uuidSchema = z.string().uuid();
const decodedExpirySchema = z.object({ exp: z.number().int() });

export class LocalDemoIdentityVerifier implements IdentityVerifier {
  async verify(_bearerToken: string, signal: AbortSignal): Promise<VerifiedIdentity> {
    if (signal.aborted) throw unavailable();
    return {
      userId: '00000000-0000-4000-8000-000000000001',
      accessToken: 'local-demo',
      aal: 'aal2',
    };
  }
}

export class SupabaseIdentityVerifier implements IdentityVerifier {
  constructor(
    private readonly url: string,
    private readonly publishableKey: string,
  ) {}

  async verify(bearerToken: string, signal: AbortSignal): Promise<VerifiedIdentity> {
    if (tokenExpired(bearerToken)) {
      throw new HttpError(401, 'AUTH_SESSION_EXPIRED', 'Your session expired. Sign in again.');
    }
    if (signal.aborted) throw unavailable();
    const client = createClient(this.url, this.publishableKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      global: { fetch: signalAwareFetch(signal) },
    });
    try {
      const { data, error } = await client.auth.getClaims(bearerToken);
      if (signal.aborted) throw unavailable();
      if (error || !data) throw invalidToken();
      const { claims } = data;
      if (claims.iss !== `${this.url}/auth/v1`) throw invalidToken();
      if (claims.role !== 'authenticated') throw invalidToken();
      if (!uuidSchema.safeParse(claims.sub).success) throw invalidToken();
      if (claims.aal !== 'aal2') {
        throw new HttpError(403, 'MFA_REQUIRED', 'Complete TOTP verification before continuing.');
      }
      return { userId: claims.sub, accessToken: bearerToken, aal: 'aal2' };
    } catch (error) {
      if (error instanceof HttpError) throw error;
      if (error instanceof TypeError || signal.aborted) throw unavailable();
      throw invalidToken();
    }
  }
}

export function createIdentityVerifier(config: AppConfig): IdentityVerifier {
  if (config.AUTH_MODE === 'local-demo') return new LocalDemoIdentityVerifier();
  return new SupabaseIdentityVerifier(
    config.VITE_SUPABASE_URL!,
    config.VITE_SUPABASE_PUBLISHABLE_KEY!,
  );
}

function signalAwareFetch(signal: AbortSignal): typeof fetch {
  return (input, init) => {
    const requestSignal = init?.signal;
    const combined = requestSignal ? AbortSignal.any([signal, requestSignal]) : signal;
    return fetch(input, { ...init, signal: combined });
  };
}

function tokenExpired(token: string): boolean {
  const payload = token.split('.')[1];
  if (!payload) return false;
  try {
    const decoded: unknown = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    const parsed = decodedExpirySchema.safeParse(decoded);
    return parsed.success && parsed.data.exp <= Math.floor(Date.now() / 1000);
  } catch {
    return false;
  }
}

function invalidToken() {
  return new HttpError(401, 'AUTH_TOKEN_INVALID', 'The authentication token is invalid.');
}

function unavailable() {
  return new HttpError(503, 'AUTH_PROVIDER_UNAVAILABLE', 'Identity verification is unavailable.');
}
