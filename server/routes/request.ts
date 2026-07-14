import type { NextFunction, Request, Response } from 'express';
import type { ZodType } from 'zod';
import { HttpError } from '../http.js';

export interface RequestIdentity {
  ownerId: string;
  token?: string;
}

export function asyncRoute(handler: (req: Request, res: Response) => Promise<unknown>) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(handler(req, res)).catch(next);
  };
}

export function validateBody(schema: ZodType) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      next(new HttpError(400, 'INVALID_INPUT', 'Request body is invalid.'));
      return;
    }
    req.body = result.data;
    next();
  };
}

export function requestIdentity(req: Request): RequestIdentity {
  if (!req.authContext) throw new HttpError(401, 'AUTH_REQUIRED', 'Authentication required.');
  const identity: RequestIdentity = { ownerId: req.authContext.userId };
  if (req.authContext.supabaseToken) identity.token = req.authContext.supabaseToken;
  return identity;
}
