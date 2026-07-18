import type { AuthInfo } from '@modelcontextprotocol/sdk/server/auth/types.js';
import type { NextFunction, Request, Response } from 'express';
import type { AppConfig } from '../config.js';
import { HttpError } from '../http.js';
import type { IdentityVerifier } from '../security/identity.js';

export function protectedResourceMetadata(config: AppConfig) {
  return {
    resource: config.mcpResource,
    authorization_servers:
      config.AUTH_MODE === 'supabase' ? [`${config.VITE_SUPABASE_URL}/auth/v1`] : [],
    scopes_supported: ['openid'],
    bearer_methods_supported: ['header'],
    resource_name: 'Lumixia Brief for Codex',
    resource_documentation: `${config.APP_URL}/settings`,
  };
}

export function requireMcpIdentity(config: AppConfig, verifier: IdentityVerifier) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const token = config.AUTH_MODE === 'local-demo' ? 'local-demo' : bearerToken(req);
      const identity = await verifier.verify(
        token,
        req.requestSignal ?? new AbortController().signal,
        'mcp',
      );
      if (config.AUTH_MODE === 'supabase' && !identity.clientId) {
        throw new HttpError(401, 'MCP_OAUTH_REQUIRED', 'Connect through Supabase OAuth first.');
      }
      const clientId = identity.clientId ?? 'local-demo';
      req.authContext = {
        userId: identity.userId,
        accessToken: identity.accessToken,
        aal: identity.aal,
      };
      (req as Request & { auth?: AuthInfo }).auth = authInfo(
        identity.accessToken,
        clientId,
        config,
      );
      return next();
    } catch (error) {
      if (isAuthenticationError(error)) {
        res.setHeader('www-authenticate', challenge(config, error.code));
      }
      return next(error);
    }
  };
}

function bearerToken(req: Request): string {
  const match = /^Bearer ([^\s]+)$/.exec(req.header('authorization') ?? '');
  if (!match?.[1]) throw new HttpError(401, 'AUTH_REQUIRED', 'Authentication required.');
  return match[1];
}

function authInfo(token: string, clientId: string, config: AppConfig): AuthInfo {
  return {
    token,
    clientId,
    scopes: ['openid'],
    resource: new URL(config.mcpResource),
  };
}

function isAuthenticationError(error: unknown): error is HttpError {
  return error instanceof HttpError && [401, 403].includes(error.status);
}

function challenge(config: AppConfig, code: string): string {
  const grantRequired = code === 'MCP_MFA_GRANT_REQUIRED' || code === 'MFA_REQUIRED';
  const error = grantRequired ? 'insufficient_scope' : 'invalid_token';
  const description = grantRequired
    ? 'Reconnect after completing TOTP approval in Lumixia Brief'
    : 'Lumixia Brief requires a valid Supabase OAuth token';
  return `Bearer resource_metadata="${config.mcpMetadataUrl}", scope="openid", error="${error}", error_description="${description}"`;
}
