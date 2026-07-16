import { Router } from 'express';
import { z } from 'zod';
import { selectNotionParentInputSchema } from '../../shared/contracts.js';
import type { AppConfig } from '../config.js';
import { perUserRateLimit } from '../http.js';
import { NotionService } from '../services/notion.js';
import { asyncRoute, projectId, requestIdentity, validateBody } from './request.js';

const oauthCallbackBodySchema = z.discriminatedUnion('result', [
  z.object({
    result: z.literal('success'),
    state: z.string().min(1).max(4000),
    code: z.string().min(1).max(4000),
  }),
  z.object({
    result: z.literal('denied'),
    state: z.string().min(1).max(4000),
    error: z.literal('access_denied'),
  }),
]);

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
  router.post(
    '/notion/callback',
    validateBody(oauthCallbackBodySchema),
    asyncRoute(async (req, res) => {
      const input = oauthCallbackBodySchema.parse(req.body);
      if (input.result === 'denied') {
        service.rejectOAuth(requestIdentity(req), input.state);
        res.json({ connected: false, cancelled: true });
        return;
      }
      await service.completeOAuth(requestIdentity(req), input.code, input.state);
      res.json({ connected: true, cancelled: false });
    }),
  );
  router.delete(
    '/notion/disconnect',
    asyncRoute(async (req, res) => {
      await service.disconnect(requestIdentity(req));
      res.json({ disconnected: true });
    }),
  );
  router.post(
    '/projects/:projectId/notion/parent',
    validateBody(selectNotionParentInputSchema),
    asyncRoute(async (req, res) => {
      const input = selectNotionParentInputSchema.parse(req.body);
      const project = await service.selectParent(
        requestIdentity(req),
        projectId(req),
        input.parentId,
      );
      res.json({ project });
    }),
  );
  router.post(
    '/projects/:projectId/notion/sync',
    perUserRateLimit(config, 8, 60),
    asyncRoute(async (req, res) => {
      const result = await service.sync(requestIdentity(req), projectId(req));
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
