import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import { HttpError } from './http.js';
import { ProjectVersionConflictError } from './store/types.js';

export function normalizeErrors(error: unknown, _req: Request, _res: Response, next: NextFunction) {
  if (error instanceof HttpError) return next(error);
  if (error instanceof ZodError) {
    return next(new HttpError(400, 'INVALID_INPUT', 'Request data is invalid.'));
  }
  if (error instanceof SyntaxError) {
    return next(new HttpError(400, 'INVALID_JSON', 'Request body must be valid JSON.'));
  }
  if (error instanceof ProjectVersionConflictError) {
    return next(
      new HttpError(
        409,
        'PROJECT_VERSION_CONFLICT',
        'The project changed in another request. Reload and try again.',
      ),
    );
  }
  return next(error);
}
