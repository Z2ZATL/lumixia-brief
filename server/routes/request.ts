import type { NextFunction, Request, Response } from 'express';
import { z, type ZodType } from 'zod';
import { HttpError } from '../http.js';

export interface RequestIdentity {
  ownerId: string;
  token?: string;
  signal?: AbortSignal;
}

const projectParamsSchema = z.object({ projectId: z.string().uuid() });
const answerParamsSchema = projectParamsSchema.extend({ clientAnswerId: z.string().uuid() });

export function projectId(req: Request): string {
  return projectParamsSchema.parse(req.params).projectId;
}

export function clientAnswerId(req: Request): string {
  return answerParamsSchema.parse(req.params).clientAnswerId;
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
  if (req.requestSignal) identity.signal = req.requestSignal;
  return identity;
}
