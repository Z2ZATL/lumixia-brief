import express from 'express';
import { type AppConfig, loadConfig } from './config.js';
import { normalizeErrors } from './errors.js';
import {
  errorHandler,
  exactOrigin,
  notFound,
  perUserRateLimit,
  requestContext,
  requestDeadline,
  requireIdentity,
} from './http.js';
import { initializeSentry, mountSentryErrors } from './observability/sentry.js';
import { createMcpMetadataRouter, createMcpRouter } from './mcp/router.js';
import {
  DisabledModelProvider,
  MockModelProvider,
  OpenAIModelProvider,
  type ModelProvider,
} from './providers/model.js';
import { LiveNotionProvider, MockNotionProvider, type NotionProvider } from './providers/notion.js';
import { createBriefRouter } from './routes/briefs.js';
import { createCapabilityRouter } from './routes/capabilities.js';
import { createHealthRouter } from './routes/health.js';
import { createInterviewRouter } from './routes/interview.js';
import { createNotionRouter } from './routes/notion.js';
import { createProjectRouter } from './routes/projects.js';
import { securityHeaders } from './security/headers.js';
import { createIdentityVerifier, type IdentityVerifier } from './security/identity.js';
import { BriefService } from './services/briefs.js';
import { InterviewService } from './services/interview.js';
import { NotionService } from './services/notion.js';
import { ProjectService } from './services/projects.js';
import { MemoryProjectStore } from './store/memory.js';
import { SupabaseProjectStore } from './store/supabase.js';
import type { ProjectStore } from './store/types.js';

export interface AppDependencies {
  config: AppConfig;
  store: ProjectStore;
  model: ModelProvider;
  notion: NotionProvider;
  identity: IdentityVerifier;
}

export function createDependencies(config = loadConfig()): AppDependencies {
  const store =
    config.DATA_MODE === 'supabase'
      ? new SupabaseProjectStore(config.VITE_SUPABASE_URL!, config.VITE_SUPABASE_PUBLISHABLE_KEY!)
      : new MemoryProjectStore();
  const model =
    config.MODEL_PROVIDER_MODE === 'live'
      ? new OpenAIModelProvider(config.OPENAI_API_KEY!, config.OPENAI_MODEL)
      : config.MODEL_PROVIDER_MODE === 'disabled'
        ? new DisabledModelProvider()
        : new MockModelProvider();
  const notion =
    config.NOTION_PROVIDER_MODE === 'live'
      ? new LiveNotionProvider(
          config.NOTION_CLIENT_ID!,
          config.NOTION_CLIENT_SECRET!,
          config.NOTION_REDIRECT_URI!,
          config.OAUTH_STATE_SECRET!,
        )
      : new MockNotionProvider();
  return { config, store, model, notion, identity: createIdentityVerifier(config) };
}

export function createApp(dependencies = createDependencies()) {
  const { config, store, model, notion, identity } = dependencies;
  initializeSentry(config);

  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1);
  app.use(requestContext(config));
  app.use(requestDeadline());
  app.use(securityHeaders(config));
  app.use(exactOrigin(config));
  app.use(express.json({ limit: '32kb', strict: true }));

  // Liveness and readiness must remain public and independent from identity providers.
  app.use('/api', createHealthRouter(config));
  if (config.codexAvailable) app.use(createMcpMetadataRouter(config));
  app.use('/api', createMcpRouter(config, store, model, identity));

  const protectedApi = express.Router();
  protectedApi.use(requireIdentity(config, identity), perUserRateLimit(config));
  protectedApi.use(createCapabilityRouter(config));
  protectedApi.use(createProjectRouter(new ProjectService(store)));
  protectedApi.use(createInterviewRouter(new InterviewService(store, model), config));
  protectedApi.use(createBriefRouter(new BriefService(store, model), config));
  protectedApi.use(createNotionRouter(new NotionService(store, notion, config), config));
  app.use('/api', protectedApi);

  mountSentryErrors(app, config);
  app.use(notFound, normalizeErrors, errorHandler);
  return app;
}
