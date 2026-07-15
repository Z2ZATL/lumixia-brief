import { createHash, randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { getAuth } from '@clerk/express';
import { RateLimiterMemory } from 'rate-limiter-flexible';
import type { AppConfig } from './config.js';

declare global {
  namespace Express {
    interface Request {
      requestId: string;
      requestSignal?: AbortSignal;
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
        route: sanitizedRoute(req),
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

const identifierPattern = /\/[0-9a-f]{8}-[0-9a-f-]{27,}\b/gi;

function sanitizedRoute(req: Request): string {
  return (req.baseUrl + req.path).replace(identifierPattern, '/:id');
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
        const authorization = req.header('authorization');
        req.authContext = {
          userId,
          ...(authorization ? { supabaseToken: authorization.replace(/^Bearer /, '') } : {}),
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
      const token = await auth.getToken();
      if (!token) throw new HttpError(401, 'SUPABASE_TOKEN_REQUIRED', 'Session token unavailable.');
      req.authContext = { userId: auth.userId, supabaseToken: token, aal: 'aal2' };
      return next();
    } catch (error) {
      return next(error);
    }
  };
}

export function hasMfaClaim(claims: Record<string, unknown>): boolean {
  if (claims['aal'] === 'aal2') return true;
  if (Array.isArray(claims['fva']) && claims['fva'].length > 1) {
    const secondFactorAge = Number(claims['fva'][1]);
    if (Number.isFinite(secondFactorAge) && secondFactorAge >= 0) return true;
  }
  return false;
}

export function perUserRateLimit(config: AppConfig, points = 90, duration = 60) {
  const limiter = new RateLimiterMemory({ points, duration });
  return async (req: Request, _res: Response, next: NextFunction) => {
    try {
      const userId = req.authContext?.userId;
      if (!userId) throw new HttpError(401, 'AUTH_REQUIRED', 'Authentication required.');
      if (config.DATA_MODE === 'supabase' && config.NODE_ENV !== 'test') {
        const allowed = await consumeDistributedLimit(config, req, userId, points, duration);
        if (!allowed)
          throw new HttpError(429, 'RATE_LIMITED', 'Too many requests. Try again shortly.');
      } else {
        await limiter.consume(userId);
      }
      return next();
    } catch (error) {
      if (error instanceof HttpError) return next(error);
      if (config.DATA_MODE === 'supabase' && config.NODE_ENV !== 'test') {
        return next(
          new HttpError(503, 'RATE_LIMIT_UNAVAILABLE', 'Request safety service unavailable.'),
        );
      }
      return next(
        new HttpError(429, 'RATE_LIMITED', 'Too many requests. Please try again shortly.'),
      );
    }
  };
}

async function consumeDistributedLimit(
  config: AppConfig,
  req: Request,
  userId: string,
  points: number,
  duration: number,
): Promise<boolean> {
  const token = req.authContext?.supabaseToken;
  if (!config.SUPABASE_URL || !config.SUPABASE_PUBLISHABLE_KEY || !token) {
    throw new Error('RATE_LIMIT_CONFIGURATION_UNAVAILABLE');
  }
  const bucket = `${req.method}:${sanitizedRoute(req)}:${points}:${duration}`;
  const response = await fetch(`${config.SUPABASE_URL}/rest/v1/rpc/consume_rate_limit`, {
    method: 'POST',
    signal: combineSignals(req.requestSignal, AbortSignal.timeout(2500)),
    headers: {
      apikey: config.SUPABASE_PUBLISHABLE_KEY,
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      p_owner_id: userId,
      p_bucket: bucket,
      p_points: points,
      p_duration_seconds: duration,
    }),
  });
  if (!response.ok) throw new Error('RATE_LIMIT_BACKEND_FAILED');
  return (await response.json()) === true;
}

export function requestDeadline(milliseconds = 65_000) {
  return (req: Request, res: Response, next: NextFunction) => {
    const controller = new AbortController();
    req.requestSignal = controller.signal;
    const timer = setTimeout(() => {
      controller.abort(new Error('REQUEST_TIMEOUT'));
      if (!res.headersSent) {
        res.status(504).json({
          error: { code: 'REQUEST_TIMEOUT', message: 'The request exceeded its safe deadline.' },
        });
      }
    }, milliseconds);
    timer.unref();
    const cleanup = () => clearTimeout(timer);
    req.once('aborted', () => controller.abort(new Error('CLIENT_DISCONNECTED')));
    res.once('finish', cleanup);
    res.once('close', () => {
      cleanup();
      if (!res.writableEnded) controller.abort(new Error('CLIENT_DISCONNECTED'));
    });
    next();
  };
}

export function combineSignals(...signals: Array<AbortSignal | undefined>): AbortSignal {
  const active = signals.filter((signal): signal is AbortSignal => Boolean(signal));
  if (!active.length) return new AbortController().signal;
  return active.length === 1 ? active[0]! : AbortSignal.any(active);
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
