import { Router } from 'express';
import { z } from 'zod';
import { selectNotionParentInputSchema } from '../../shared/contracts.js';
import type { AppConfig } from '../config.js';
import { perUserRateLimit } from '../http.js';
import { NotionService } from '../services/notion.js';
import { asyncRoute, requestIdentity, validateBody } from './request.js';

export function createNotionRouter(service: NotionService, config: AppConfig) {
  const router = Router();
  router.get('/notion/connect', (req, res) => {
    res.json({ authorizationUrl: service.authorizationUrl(requestIdentity(req)) });
  });
  router.get(
    '/notion/status',
    asyncRoute(async (req, res) => {
      res.json(await service.status(requestIdentity(req)));
    }),
  );
  router.get(
    '/notion/pages',
    asyncRoute(async (req, res) => {
      res.json({ pages: await service.listPages(requestIdentity(req)) });
    }),
  );
  router.get(
    '/notion/callback',
    asyncRoute(async (req, res) => {
      const code = z.string().min(1).parse(req.query['code']);
      const state = z.string().min(1).parse(req.query['state']);
      res.redirect(await service.completeOAuth(requestIdentity(req), code, state));
    }),
  );
  router.delete(
    '/notion/disconnect',
    asyncRoute(async (req, res) => {
      await service.disconnect(requestIdentity(req));
      res.sendStatus(204);
    }),
  );
  router.post(
    '/projects/:projectId/notion/parent',
    validateBody(selectNotionParentInputSchema),
    asyncRoute(async (req, res) => {
      const input = selectNotionParentInputSchema.parse(req.body);
      const project = await service.selectParent(
        requestIdentity(req),
        String(req.params['projectId']),
        input.parentId,
      );
      res.json({ project });
    }),
  );
  router.post(
    '/projects/:projectId/notion/sync',
    perUserRateLimit(config, 8, 60),
    asyncRoute(async (req, res) => {
      const result = await service.sync(requestIdentity(req), String(req.params['projectId']));
      res.status(result.httpStatus).json({
        project: result.project,
        pageId: result.pageId,
        status: result.status,
        idempotent: result.idempotent,
      });
    }),
  );
  return router;
}
