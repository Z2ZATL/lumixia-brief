import { clerkMiddleware } from '@clerk/express';
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
  requireMfa,
} from './http.js';
import { initializeSentry, mountSentryErrors } from './observability/sentry.js';
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
}

export function createDependencies(config = loadConfig()): AppDependencies {
  const store =
    config.DATA_MODE === 'supabase'
      ? new SupabaseProjectStore(config.SUPABASE_URL!, config.SUPABASE_PUBLISHABLE_KEY!)
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
  return { config, store, model, notion };
}

export function createApp(dependencies = createDependencies()) {
  const { config, store, model, notion } = dependencies;
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

  if (!config.authBypass && config.NODE_ENV !== 'test') {
    app.use(
      clerkMiddleware({
        ...(config.CLERK_SECRET_KEY ? { secretKey: config.CLERK_SECRET_KEY } : {}),
        ...(config.VITE_CLERK_PUBLISHABLE_KEY
          ? { publishableKey: config.VITE_CLERK_PUBLISHABLE_KEY }
          : {}),
      }),
    );
  }

  const protectedApi = express.Router();
  protectedApi.use(requireMfa(config), perUserRateLimit(config));
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
