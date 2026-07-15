import { Router, type Response } from 'express';
import { submitAnswerInputSchema } from '../../shared/contracts.js';
import type { AppConfig } from '../config.js';
import { perUserRateLimit } from '../http.js';
import { InterviewService, type InterviewServiceResult } from '../services/interview.js';
import { asyncRoute, clientAnswerId, projectId, requestIdentity, validateBody } from './request.js';

function sendResult(res: Response, result: InterviewServiceResult) {
  res.status(result.httpStatus).json({
    project: result.project,
    answer: result.answer,
    status: result.status,
    idempotent: result.idempotent,
  });
}

export function createInterviewRouter(service: InterviewService, config: AppConfig) {
  const router = Router();
  router.post(
    '/projects/:projectId/interview/start',
    asyncRoute(async (req, res) => {
      const project = await service.start(requestIdentity(req), projectId(req));
      res.json({ project });
    }),
  );
  router.post(
    '/projects/:projectId/interview/answers',
    perUserRateLimit(config, 15, 60),
    validateBody(submitAnswerInputSchema),
    asyncRoute(async (req, res) => {
      const result = await service.submit(
        requestIdentity(req),
        projectId(req),
        submitAnswerInputSchema.parse(req.body),
      );
      sendResult(res, result);
    }),
  );
  router.post(
    '/projects/:projectId/interview/answers/:clientAnswerId/retry',
    asyncRoute(async (req, res) => {
      const result = await service.retry(requestIdentity(req), projectId(req), clientAnswerId(req));
      sendResult(res, result);
    }),
  );
  return router;
}
