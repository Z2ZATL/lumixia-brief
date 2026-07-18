import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import { Router, type Request, type Response } from 'express';
import type { AppConfig } from '../config.js';
import { HttpError, perUserRateLimit } from '../http.js';
import type { ModelProvider } from '../providers/model.js';
import { requestIdentity } from '../routes/request.js';
import type { IdentityVerifier } from '../security/identity.js';
import { BriefService } from '../services/briefs.js';
import { InterviewService } from '../services/interview.js';
import { ProjectService } from '../services/projects.js';
import type { ProjectStore } from '../store/types.js';
import { protectedResourceMetadata, requireMcpIdentity } from './auth.js';
import { createLumixiaMcpServer } from './tools.js';

export function createMcpMetadataRouter(config: AppConfig) {
  const router = Router();
  const metadata = protectedResourceMetadata(config);
  const handler = (_req: Request, res: Response) => {
    res.setHeader('cache-control', 'public, max-age=300');
    res.json(metadata);
  };
  router.get('/.well-known/oauth-protected-resource', handler);
  router.get('/.well-known/oauth-protected-resource/api/mcp', handler);
  return router;
}

export function createMcpRouter(
  config: AppConfig,
  store: ProjectStore,
  model: ModelProvider,
  identityVerifier: IdentityVerifier,
) {
  const router = Router();
  if (!config.codexAvailable) {
    router.all('/mcp', (_req, _res, next) =>
      next(new HttpError(404, 'MCP_DISABLED', 'The Codex connection is disabled.')),
    );
    return router;
  }
  router.use(
    '/mcp',
    requireMcpIdentity(config, identityVerifier),
    perUserRateLimit(config, 45, 60),
  );
  router.post('/mcp', (req, res, next) => {
    handleMcpRequest(req, res, store, model).catch(next);
  });
  router.get('/mcp', methodNotAllowed);
  router.delete('/mcp', methodNotAllowed);
  return router;
}

async function handleMcpRequest(
  req: Request,
  res: Response,
  store: ProjectStore,
  model: ModelProvider,
): Promise<void> {
  const identity = requestIdentity(req);
  const server = createLumixiaMcpServer(identity, {
    projects: new ProjectService(store),
    interview: new InterviewService(store, model),
    briefs: new BriefService(store, model),
  });
  const transport = new StreamableHTTPServerTransport({
    enableJsonResponse: true,
  });
  res.once('close', () => {
    void Promise.allSettled([transport.close(), server.close()]);
  });
  await server.connect(transport as unknown as Transport);
  await transport.handleRequest(req, res, req.body);
}

function methodNotAllowed(_req: Request, res: Response): void {
  res.status(405).json({
    jsonrpc: '2.0',
    error: { code: -32_000, message: 'Method not allowed.' },
    id: null,
  });
}
