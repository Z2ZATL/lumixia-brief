import { createHash, randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { getAuth } from '@clerk/express';
import { RateLimiterMemory } from 'rate-limiter-flexible';
import type { AppConfig } from './config.js';

declare global {
  namespace Express {
    interface Request {
      requestId: string;
      authContext?: { userId: string; supabaseToken?: string; aal: 'aal2' };
    }
  }
}

export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

export function requestContext(config: AppConfig) {
  return (req: Request, res: Response, next: NextFunction) => {
    const startedAt = performance.now();
    req.requestId = req.header('x-request-id')?.slice(0, 100) || randomUUID();
    res.setHeader('x-request-id', req.requestId);
    res.on('finish', () => {
      const userId = req.authContext?.userId;
      const event = {
        level: 'info',
        requestId: req.requestId,
        route: req.route?.path ?? req.path,
        method: req.method,
        status: res.statusCode,
        durationMs: Math.round(performance.now() - startedAt),
        userHash: userId
          ? createHash('sha256').update(userId).digest('hex').slice(0, 12)
          : undefined,
        deploymentSha: config.deploymentSha,
      };
      process.stdout.write(`${JSON.stringify(event)}\n`);
    });
    next();
  };
}

export function exactOrigin(config: AppConfig) {
  return (req: Request, res: Response, next: NextFunction) => {
    const origin = req.header('origin');
    if (origin === config.allowedOrigin) {
      res.setHeader('access-control-allow-origin', config.allowedOrigin);
      res.setHeader('access-control-allow-credentials', 'true');
      res.setHeader('vary', 'Origin');
    }
    if (req.method === 'OPTIONS') {
      if (origin !== config.allowedOrigin)
        return next(new HttpError(403, 'ORIGIN_DENIED', 'Origin denied.'));
      res.setHeader('access-control-allow-methods', 'GET,POST,PATCH,DELETE,OPTIONS');
      res.setHeader('access-control-allow-headers', 'Content-Type,Authorization,X-Request-ID');
      return res.sendStatus(204);
    }
    if (!['GET', 'HEAD'].includes(req.method) && origin && origin !== config.allowedOrigin) {
      return next(new HttpError(403, 'ORIGIN_DENIED', 'Origin denied.'));
    }
    return next();
  };
}

export function requireMfa(config: AppConfig) {
  return async (req: Request, _res: Response, next: NextFunction) => {
    try {
      if (config.authBypass || config.NODE_ENV === 'test') {
        const userId = req.header('x-test-user') ?? 'local-demo-user';
        const aal = req.header('x-test-aal') ?? 'aal2';
        if (aal !== 'aal2')
          throw new HttpError(403, 'MFA_REQUIRED', 'A second factor is required.');
        req.authContext = {
          userId,
          supabaseToken: req.header('authorization')?.replace(/^Bearer /, ''),
          aal: 'aal2',
        };
        return next();
      }

      const auth = getAuth(req);
      if (!auth.userId) throw new HttpError(401, 'AUTH_REQUIRED', 'Authentication required.');
      const claims = (auth.sessionClaims ?? {}) as Record<string, unknown>;
      if (!hasMfaClaim(claims)) {
        throw new HttpError(403, 'MFA_REQUIRED', 'Complete TOTP verification before continuing.');
      }
      const token = await auth.getToken({ template: 'supabase' });
      if (!token) throw new HttpError(401, 'SUPABASE_TOKEN_REQUIRED', 'Session token unavailable.');
      req.authContext = { userId: auth.userId, supabaseToken: token, aal: 'aal2' };
      return next();
    } catch (error) {
      return next(error);
    }
  };
}

export function hasMfaClaim(claims: Record<string, unknown>): boolean {
  if (claims.aal === 'aal2') return true;
  if (Array.isArray(claims.fva) && claims.fva.length > 1) {
    const secondFactorAge = Number(claims.fva[1]);
    if (Number.isFinite(secondFactorAge) && secondFactorAge >= 0) return true;
  }
  if (Array.isArray(claims.amr)) {
    return claims.amr.some((method) => ['mfa', 'totp', 'otp'].includes(String(method)));
  }
  return false;
}

export function perUserRateLimit(points = 90, duration = 60) {
  const limiter = new RateLimiterMemory({ points, duration });
  return async (req: Request, _res: Response, next: NextFunction) => {
    try {
      await limiter.consume(req.authContext?.userId ?? req.ip ?? 'anonymous');
      next();
    } catch {
      next(new HttpError(429, 'RATE_LIMITED', 'Too many requests. Please try again shortly.'));
    }
  };
}

export function notFound(_req: Request, _res: Response, next: NextFunction) {
  next(new HttpError(404, 'NOT_FOUND', 'Route not found.'));
}

export function errorHandler(error: unknown, req: Request, res: Response, _next: NextFunction) {
  const known = error instanceof HttpError;
  const status = known ? error.status : 500;
  const code = known ? error.code : 'INTERNAL_ERROR';
  const message = known ? error.message : 'The request could not be completed.';
  if (!known) {
    process.stderr.write(
      `${JSON.stringify({ level: 'error', requestId: req.requestId, code, errorType: error instanceof Error ? error.name : 'unknown' })}\n`,
    );
  }
  res.status(status).json({ error: { code, message, requestId: req.requestId } });
}
