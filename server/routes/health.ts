import { Router } from 'express';
import type { AppConfig } from '../config.js';
import { asyncRoute } from './request.js';

export function createHealthRouter(config: AppConfig) {
  const router = Router();
  router.get('/health', (_req, res) => {
    res.json({
      ok: true,
      version: process.env['npm_package_version'] ?? '0.1.0',
      sha: config.deploymentSha,
    });
  });
  router.get(
    '/ready',
    asyncRoute(async (_req, res) => {
      const ready = await isDatabaseReady(config);
      res.status(ready ? 200 : 503).json({ ready });
    }),
  );
  return router;
}

async function isDatabaseReady(config: AppConfig) {
  if (config.DATA_MODE !== 'supabase') return true;
  try {
    const response = await fetch(`${config.SUPABASE_URL}/rest/v1/rpc/readiness_check`, {
      method: 'POST',
      headers: {
        apikey: config.SUPABASE_PUBLISHABLE_KEY!,
        'content-type': 'application/json',
      },
      body: '{}',
      signal: AbortSignal.timeout(3000),
    });
    return response.ok;
  } catch {
    return false;
  }
}
