import { Router } from 'express';
import { createProjectInputSchema } from '../../shared/contracts.js';
import { ProjectService } from '../services/projects.js';
import { asyncRoute, requestIdentity, validateBody } from './request.js';

export function createProjectRouter(service: ProjectService) {
  const router = Router();
  router.get(
    '/projects',
    asyncRoute(async (req, res) => {
      res.json({ projects: await service.list(requestIdentity(req)) });
    }),
  );
  router.post(
    '/projects',
    validateBody(createProjectInputSchema),
    asyncRoute(async (req, res) => {
      const project = await service.create(
        requestIdentity(req),
        createProjectInputSchema.parse(req.body),
      );
      res.status(201).json({ project });
    }),
  );
  router.get(
    '/projects/:projectId',
    asyncRoute(async (req, res) => {
      res.json({
        project: await service.get(requestIdentity(req), String(req.params['projectId'])),
      });
    }),
  );
  router.delete(
    '/projects/:projectId',
    asyncRoute(async (req, res) => {
      await service.delete(requestIdentity(req), String(req.params['projectId']));
      res.sendStatus(204);
    }),
  );
  return router;
}
