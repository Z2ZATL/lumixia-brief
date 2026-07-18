import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';
import type { AppConfig } from '../config.js';
import { HttpError } from '../http.js';

export interface VerifiedIdentity {
  userId: string;
  accessToken: string;
  aal: 'aal2';
  clientId?: string;
}

export type IdentityContext = 'browser' | 'mcp';

export interface IdentityVerifier {
  verify(
    bearerToken: string,
    signal: AbortSignal,
    context?: IdentityContext,
  ): Promise<VerifiedIdentity>;
}

const uuidSchema = z.string().uuid();
const decodedExpirySchema = z.object({ exp: z.number().int() });
const identityClaimsSchema = z.object({
  iss: z.string(),
  aud: z.unknown(),
  role: z.literal('authenticated'),
  sub: uuidSchema,
  aal: z.enum(['aal1', 'aal2']),
  client_id: z.string().trim().min(1).max(200).optional(),
});

type IdentityClaims = z.infer<typeof identityClaimsSchema>;

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

  async verify(
    bearerToken: string,
    signal: AbortSignal,
    context: IdentityContext = 'browser',
  ): Promise<VerifiedIdentity> {
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
      const claims = validateClaims(data.claims, `${this.url}/auth/v1`);
      if (context === 'browser') return browserIdentity(claims, bearerToken);
      return await this.mcpIdentity(
        claims,
        bearerToken,
        signal,
        async () => await client.rpc('verify_codex_oauth_grant'),
      );
    } catch (error) {
      if (error instanceof HttpError) throw error;
      if (error instanceof TypeError || signal.aborted) throw unavailable();
      throw invalidToken();
    }
  }

  private async mcpIdentity(
    claims: IdentityClaims,
    bearerToken: string,
    signal: AbortSignal,
    verifyGrant: () => Promise<{ data: unknown; error: unknown }>,
  ): Promise<VerifiedIdentity> {
    if (!claims.client_id) {
      throw new HttpError(401, 'MCP_OAUTH_REQUIRED', 'Connect through Supabase OAuth first.');
    }
    const { data, error } = await verifyGrant();
    if (signal.aborted) throw unavailable();
    if (error) throw unavailable();
    if (data !== true) {
      throw new HttpError(
        403,
        'MCP_MFA_GRANT_REQUIRED',
        'Reconnect Codex after completing TOTP approval in Lumixia Brief.',
      );
    }
    return verifiedIdentity(claims, bearerToken);
  }
}

function validateClaims(claims: unknown, expectedIssuer: string): IdentityClaims {
  const parsed = identityClaimsSchema.safeParse(claims);
  if (!parsed.success) throw invalidToken();
  if (parsed.data.iss !== expectedIssuer) throw invalidToken();
  if (!validAudience(parsed.data.aud)) throw invalidToken();
  return parsed.data;
}

function browserIdentity(claims: IdentityClaims, bearerToken: string): VerifiedIdentity {
  if (claims.client_id) {
    throw new HttpError(
      403,
      'MCP_TOKEN_NOT_ALLOWED',
      'Codex OAuth tokens can only access the MCP endpoint.',
    );
  }
  if (claims.aal !== 'aal2') {
    throw new HttpError(403, 'MFA_REQUIRED', 'Complete TOTP verification before continuing.');
  }
  return verifiedIdentity(claims, bearerToken);
}

function verifiedIdentity(claims: IdentityClaims, bearerToken: string): VerifiedIdentity {
  return {
    userId: claims.sub,
    accessToken: bearerToken,
    aal: 'aal2',
    ...(claims.client_id ? { clientId: claims.client_id } : {}),
  };
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

function validAudience(audience: unknown): boolean {
  return (
    audience === 'authenticated' || (Array.isArray(audience) && audience.includes('authenticated'))
  );
}

function unavailable() {
  return new HttpError(503, 'AUTH_PROVIDER_UNAVAILABLE', 'Identity verification is unavailable.');
}
