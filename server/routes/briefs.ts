import { Router } from 'express';
import { editBriefInputSchema, requestChangesInputSchema } from '../../shared/contracts.js';
import type { AppConfig } from '../config.js';
import { perUserRateLimit } from '../http.js';
import { BriefService } from '../services/briefs.js';
import { asyncRoute, requestIdentity, validateBody } from './request.js';

export function createBriefRouter(service: BriefService, config: AppConfig) {
  const router = Router();
  router.post(
    '/projects/:projectId/briefs/generate',
    perUserRateLimit(config, 8, 60),
    asyncRoute(async (req, res) => {
      const result = await service.generate(requestIdentity(req), String(req.params['projectId']));
      res.status(result.httpStatus).json(result);
    }),
  );
  router.get(
    '/projects/:projectId/briefs',
    asyncRoute(async (req, res) => {
      const briefs = await service.list(requestIdentity(req), String(req.params['projectId']));
      res.json({ briefs });
    }),
  );
  router.patch(
    '/projects/:projectId/briefs/current',
    validateBody(editBriefInputSchema),
    asyncRoute(async (req, res) => {
      const result = await service.edit(
        requestIdentity(req),
        String(req.params['projectId']),
        editBriefInputSchema.parse(req.body),
      );
      res.json(result);
    }),
  );
  router.post(
    '/projects/:projectId/briefs/current/approve',
    asyncRoute(async (req, res) => {
      const result = await service.approve(requestIdentity(req), String(req.params['projectId']));
      res.json(result);
    }),
  );
  router.post(
    '/projects/:projectId/briefs/current/request-changes',
    validateBody(requestChangesInputSchema),
    asyncRoute(async (req, res) => {
      const project = await service.requestChanges(
        requestIdentity(req),
        String(req.params['projectId']),
        requestChangesInputSchema.parse(req.body),
      );
      res.json({ project });
    }),
  );
  return router;
}
