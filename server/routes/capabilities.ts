import { Router } from 'express';
import { capabilityStatusSchema } from '../../shared/contracts.js';
import type { AppConfig } from '../config.js';

export function createCapabilityRouter(config: AppConfig) {
  const router = Router();
  router.get('/capabilities', (_req, res) => {
    res.json(
      capabilityStatusSchema.parse({
        model: {
          mode: config.MODEL_PROVIDER_MODE,
          available: config.modelAvailable,
        },
        notion: {
          mode: config.NOTION_PROVIDER_MODE,
          available: config.NOTION_PROVIDER_MODE === 'live' || config.APP_ENV === 'local',
        },
        codex: {
          mode: config.CODEX_MCP_MODE,
          available: config.codexAvailable,
        },
        codexLocal: {
          mode: config.CODEX_LOCAL_BRIDGE_MODE,
          available: config.codexLocalAvailable,
        },
      }),
    );
  });
  return router;
}
