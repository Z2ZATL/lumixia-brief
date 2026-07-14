import { createHash, randomUUID } from 'node:crypto';
import { clerkMiddleware } from '@clerk/express';
import * as Sentry from '@sentry/node';
import express, { type Request, type Response } from 'express';
import helmet from 'helmet';
import { z, ZodError, type ZodType } from 'zod';
import {
  briefVersionSchema,
  createProjectInputSchema,
  editBriefInputSchema,
  projectSchema,
  requestChangesInputSchema,
  selectNotionParentInputSchema,
  submitAnswerInputSchema,
  type BriefVersion,
  type Project,
} from '../shared/contracts.js';
import { sanitizeTelemetryText } from '../shared/telemetry.js';
import { type AppConfig, loadConfig } from './config.js';
import {
  assessInitialPrompt,
  confidenceScore,
  emptyAssessments,
  isReadyToBrief,
} from './domain/confidence.js';
import { enforceStopRules, initialQuestion } from './domain/interview.js';
import {
  assertCanApprove,
  assertCanGenerate,
  assertCanSync,
  WorkflowConflict,
} from './domain/workflow.js';
import {
  errorHandler,
  exactOrigin,
  HttpError,
  notFound,
  perUserRateLimit,
  requestDeadline,
  requestContext,
  requireMfa,
} from './http.js';
import { MockModelProvider, OpenAIModelProvider, type ModelProvider } from './providers/model.js';
import {
  LiveNotionProvider,
  MockNotionProvider,
  NotionApiError,
  type NotionProvider,
} from './providers/notion.js';
import { decryptSecret, encryptSecret } from './security/encryption.js';
import { MemoryProjectStore } from './store/memory.js';
import { SupabaseProjectStore } from './store/supabase.js';
import { ProjectVersionConflictError, type ProjectStore } from './store/types.js';

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
    config.PROVIDER_MODE === 'live'
      ? new OpenAIModelProvider(config.OPENAI_API_KEY!, config.OPENAI_MODEL)
      : new MockModelProvider();
  const notion =
    config.PROVIDER_MODE === 'live'
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

  if (config.SENTRY_DSN) {
    Sentry.init({
      dsn: config.SENTRY_DSN,
      sendDefaultPii: false,
      tracesSampleRate: config.APP_ENV === 'production' ? 0.15 : 1,
      beforeSend(event) {
        delete event.request?.data;
        delete event.request?.cookies;
        delete event.request?.headers;
        delete event.request?.query_string;
        if (event.request?.url) event.request.url = sanitizeTelemetryText(event.request.url);
        if (event.transaction) event.transaction = sanitizeTelemetryText(event.transaction);
        delete event.user;
        return event;
      },
      beforeSendTransaction(event) {
        delete event.request?.data;
        delete event.request?.cookies;
        delete event.request?.headers;
        delete event.request?.query_string;
        delete event.user;
        if (event.request?.url) event.request.url = sanitizeTelemetryText(event.request.url);
        if (event.transaction) event.transaction = sanitizeTelemetryText(event.transaction);
        return event;
      },
      beforeBreadcrumb(breadcrumb) {
        delete breadcrumb.data;
        if (breadcrumb.message) breadcrumb.message = sanitizeTelemetryText(breadcrumb.message);
        return breadcrumb;
      },
    });
  }

  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1);
  app.use(requestContext(config));
  app.use(requestDeadline());
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          baseUri: ["'self'"],
          objectSrc: ["'none'"],
          frameAncestors: ["'none'"],
          formAction: ["'self'", 'https://*.clerk.accounts.dev', 'https://*.clerk.com'],
          scriptSrc: [
            "'self'",
            "'unsafe-inline'",
            'https://*.clerk.accounts.dev',
            'https://*.clerk.com',
          ],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", 'data:', 'blob:', 'https://img.clerk.com'],
          fontSrc: ["'self'", 'data:'],
          connectSrc: [
            "'self'",
            'https://*.clerk.accounts.dev',
            'https://*.clerk.com',
            'https://*.sentry.io',
          ],
          frameSrc: ['https://*.clerk.accounts.dev', 'https://*.clerk.com'],
          workerSrc: ["'self'", 'blob:'],
          upgradeInsecureRequests: config.NODE_ENV === 'production' ? [] : null,
        },
      },
      crossOriginResourcePolicy: { policy: 'same-site' },
    }),
  );
  app.use(exactOrigin(config));
  app.use(express.json({ limit: '32kb', strict: true }));
  if (!config.authBypass && config.NODE_ENV !== 'test') {
    app.use(
      clerkMiddleware(config.CLERK_SECRET_KEY ? { secretKey: config.CLERK_SECRET_KEY } : undefined),
    );
  }

  app.get('/api/health', (_req, res) => {
    res.json({
      ok: true,
      version: process.env['npm_package_version'] ?? '0.1.0',
      sha: config.deploymentSha,
    });
  });
  app.get('/api/ready', async (_req, res) => {
    let ready = true;
    if (config.DATA_MODE === 'supabase') {
      try {
        const response = await fetch(`${config.SUPABASE_URL}/rest/v1/`, {
          headers: { apikey: config.SUPABASE_PUBLISHABLE_KEY! },
          signal: AbortSignal.timeout(3000),
        });
        ready = response.ok;
      } catch {
        ready = false;
      }
    }
    res.status(ready ? 200 : 503).json({ ready });
  });

  const protectedApi = express.Router();
  protectedApi.use(requireMfa(config), perUserRateLimit(config));

  protectedApi.get(
    '/projects',
    asyncRoute(async (req, res) => {
      res.json({ projects: await store.listProjects(userId(req), token(req)) });
    }),
  );

  protectedApi.post(
    '/projects',
    validateBody(createProjectInputSchema),
    asyncRoute(async (req, res) => {
      const input = createProjectInputSchema.parse(req.body);
      const now = new Date().toISOString();
      const project: Project = {
        id: randomUUID(),
        revision: 1,
        ownerId: userId(req),
        title: input.title,
        initialPrompt: input.initialPrompt,
        locale: input.locale,
        workflowStatus: 'draft',
        syncStatus: 'not_synced',
        answers: [],
        analysis: {
          facts: [],
          assumptions: [],
          contradictions: [],
          dimensionAssessments: emptyAssessments(),
          nextQuestion: initialQuestion(input.locale),
          shouldStop: false,
          stopReason: 'continue',
        },
        initialAssessments: assessInitialPrompt(input.initialPrompt),
        currentQuestion: initialQuestion(input.locale),
        briefVersions: [],
        createdAt: now,
        updatedAt: now,
        notionParentId: null,
        notionPageId: null,
        lastSyncError: null,
      };
      res
        .status(201)
        .json({ project: await store.createProject(projectSchema.parse(project), token(req)) });
    }),
  );

  protectedApi.get(
    '/projects/:projectId',
    asyncRoute(async (req, res) => {
      res.json({ project: await ownedProject(req, store) });
    }),
  );

  protectedApi.delete(
    '/projects/:projectId',
    asyncRoute(async (req, res) => {
      const deleted = await store.deleteProject(
        userId(req),
        String(req.params['projectId']),
        token(req),
      );
      if (!deleted) throw new HttpError(404, 'PROJECT_NOT_FOUND', 'Project not found.');
      res.sendStatus(204);
    }),
  );

  protectedApi.post(
    '/projects/:projectId/interview/start',
    asyncRoute(async (req, res) => {
      const project = await ownedProject(req, store);
      if (project.workflowStatus === 'draft') project.workflowStatus = 'interviewing';
      project.currentQuestion ??= initialQuestion(project.locale);
      touch(project);
      res.json({ project: await store.saveProject(project, token(req)) });
    }),
  );

  protectedApi.post(
    '/projects/:projectId/interview/answers',
    perUserRateLimit(config, 15, 60),
    validateBody(submitAnswerInputSchema),
    asyncRoute(async (req, res) => {
      const input = submitAnswerInputSchema.parse(req.body);
      let project = await ownedProject(req, store);
      if (project.answers.length >= 12)
        throw new HttpError(409, 'QUESTION_LIMIT', 'The 12-question limit has been reached.');
      if (project.workflowStatus === 'approved')
        throw new HttpError(409, 'APPROVED_IMMUTABLE', 'Request a revision first.');

      const claim = await store.claimInterviewTurn(
        userId(req),
        project.id,
        input.clientAnswerId,
        input,
        false,
        token(req),
      );
      if (claim.state === 'busy') {
        throw new HttpError(
          409,
          'PROJECT_BUSY',
          'Another interview answer is still being processed.',
        );
      }
      if (claim.state === 'conflict') {
        throw new HttpError(
          409,
          'IDEMPOTENCY_CONFLICT',
          'This answer ID was already used with different content.',
        );
      }
      if (claim.state === 'duplicate') {
        project =
          claim.result ?? (await store.getProject(userId(req), project.id, token(req))) ?? project;
        const existing = project.answers.find(
          (answer) => answer.clientAnswerId === input.clientAnswerId,
        );
        return res.status(claim.status === 'pending' ? 202 : 200).json({
          project,
          answer: existing ?? null,
          status: claim.status,
          idempotent: true,
        });
      }

      const answer = {
        id: randomUUID(),
        clientAnswerId: input.clientAnswerId,
        question: input.question,
        dimension: input.dimension,
        text: input.answer,
        status: 'pending' as const,
        errorCode: null,
        createdAt: new Date().toISOString(),
        processedAt: null,
      };
      project.answers.push(answer);
      project.workflowStatus = 'interviewing';
      touch(project);
      project = await store.saveProject(project, token(req));

      try {
        const analysis = enforceStopRules(
          await model.analyzeInterview(project),
          project.answers.length,
        );
        project.analysis = analysis;
        project.currentQuestion = analysis.nextQuestion;
        const savedAnswer = project.answers.find((item) => item.id === answer.id)!;
        savedAnswer.status = 'processed';
        savedAnswer.processedAt = new Date().toISOString();
        touch(project);
        project = await store.saveProject(project, token(req));
        await store.completeInterviewTurn(
          userId(req),
          project.id,
          input.clientAnswerId,
          'processed',
          project,
          null,
          token(req),
        );
        return res.json({
          project,
          answer: savedAnswer,
          status: 'processed',
          idempotent: false,
        });
      } catch {
        const failed = project.answers.find((item) => item.id === answer.id)!;
        failed.status = 'failed';
        failed.errorCode = 'MODEL_UNAVAILABLE';
        touch(project);
        project = await store.saveProject(project, token(req));
        await store.completeInterviewTurn(
          userId(req),
          project.id,
          input.clientAnswerId,
          'failed',
          project,
          'MODEL_UNAVAILABLE',
          token(req),
        );
        throw new HttpError(
          502,
          'MODEL_UNAVAILABLE',
          'The answer is saved and can be retried safely.',
        );
      }
    }),
  );

  protectedApi.post(
    '/projects/:projectId/interview/answers/:clientAnswerId/retry',
    asyncRoute(async (req, res) => {
      const project = await ownedProject(req, store);
      const answer = project.answers.find(
        (item) => item.clientAnswerId === req.params['clientAnswerId'],
      );
      if (!answer) throw new HttpError(404, 'ANSWER_NOT_FOUND', 'Answer not found.');
      const claim = await store.claimInterviewTurn(
        userId(req),
        project.id,
        answer.clientAnswerId,
        {
          clientAnswerId: answer.clientAnswerId,
          question: answer.question,
          dimension: answer.dimension,
          answer: answer.text,
        },
        true,
        token(req),
      );
      if (claim.state === 'busy')
        throw new HttpError(409, 'PROJECT_BUSY', 'Another answer is being processed.');
      if (claim.state === 'conflict')
        throw new HttpError(409, 'IDEMPOTENCY_CONFLICT', 'Stored answer content does not match.');
      if (claim.state === 'duplicate') {
        const resultProject = claim.result ?? project;
        const resultAnswer = resultProject.answers.find(
          (item) => item.clientAnswerId === answer.clientAnswerId,
        );
        return res.status(claim.status === 'pending' ? 202 : 200).json({
          project: resultProject,
          answer: resultAnswer ?? answer,
          status: claim.status,
          idempotent: true,
        });
      }
      answer.status = 'pending';
      answer.errorCode = null;
      touch(project);
      await store.saveProject(project, token(req));
      try {
        project.analysis = enforceStopRules(
          await model.analyzeInterview(project),
          project.answers.length,
        );
        project.currentQuestion = project.analysis.nextQuestion;
        answer.status = 'processed';
        answer.processedAt = new Date().toISOString();
        touch(project);
        const saved = await store.saveProject(project, token(req));
        await store.completeInterviewTurn(
          userId(req),
          project.id,
          answer.clientAnswerId,
          'processed',
          saved,
          null,
          token(req),
        );
        return res.json({ project: saved, answer, status: 'processed', idempotent: false });
      } catch {
        answer.status = 'failed';
        answer.errorCode = 'MODEL_UNAVAILABLE';
        touch(project);
        const failed = await store.saveProject(project, token(req));
        await store.completeInterviewTurn(
          userId(req),
          project.id,
          answer.clientAnswerId,
          'failed',
          failed,
          'MODEL_UNAVAILABLE',
          token(req),
        );
        throw new HttpError(
          502,
          'MODEL_UNAVAILABLE',
          'The answer remains saved and can be retried.',
        );
      }
    }),
  );

  protectedApi.post(
    '/projects/:projectId/briefs/generate',
    perUserRateLimit(config, 8, 60),
    asyncRoute(async (req, res) => {
      const project = await ownedProject(req, store);
      try {
        assertCanGenerate(project);
      } catch (error) {
        throw workflowHttpError(error);
      }
      const latest = project.briefVersions.at(-1);
      if (latest?.status === 'draft') return res.json({ project, brief: latest, idempotent: true });
      const generated = await model.generateBrief(project);
      const initialScore = confidenceScore(project.initialAssessments);
      const finalScore = confidenceScore(project.analysis.dimensionAssessments);
      const now = new Date().toISOString();
      const brief: BriefVersion = {
        id: randomUUID(),
        projectId: project.id,
        version: (latest?.version ?? 0) + 1,
        title: generated.title,
        sections: generated.sections,
        status: 'draft',
        clarificationLabel: isReadyToBrief(project.analysis, project.answers.length)
          ? 'ready'
          : 'needs_clarification',
        alignment: {
          initialScore,
          finalScore,
          delta: finalScore - initialScore,
          assumptionsSurfaced: project.analysis.assumptions.length,
          contradictionsResolved: project.analysis.contradictions.filter((item) => item.resolved)
            .length,
          humanDecisionsRemaining: project.analysis.assumptions.filter(
            (item) => item.needsHumanDecision,
          ).length,
        },
        createdAt: now,
        updatedAt: now,
        approvedAt: null,
        approvedBy: null,
      };
      project.briefVersions.push(briefVersionSchema.parse(brief));
      project.workflowStatus = 'needs_review';
      touch(project);
      return res
        .status(201)
        .json({ project: await store.saveProject(project, token(req)), brief, idempotent: false });
    }),
  );

  protectedApi.get(
    '/projects/:projectId/briefs',
    asyncRoute(async (req, res) => {
      const project = await ownedProject(req, store);
      res.json({ briefs: project.briefVersions });
    }),
  );

  protectedApi.patch(
    '/projects/:projectId/briefs/current',
    validateBody(editBriefInputSchema),
    asyncRoute(async (req, res) => {
      const input = editBriefInputSchema.parse(req.body);
      const project = await ownedProject(req, store);
      const latest = project.briefVersions.at(-1);
      if (!latest || latest.version !== input.expectedVersion) {
        throw new HttpError(409, 'VERSION_CONFLICT', 'The brief changed. Reload before editing.');
      }
      let editable = latest;
      if (latest.status === 'approved') {
        const now = new Date().toISOString();
        editable = {
          ...latest,
          id: randomUUID(),
          version: latest.version + 1,
          status: 'draft',
          title: input.title,
          sections: input.sections,
          approvedAt: null,
          approvedBy: null,
          createdAt: now,
          updatedAt: now,
        };
        project.briefVersions.push(editable);
      } else if (latest.status === 'draft') {
        editable.title = input.title;
        editable.sections = input.sections;
        editable.updatedAt = new Date().toISOString();
      } else {
        throw new HttpError(409, 'BRIEF_IMMUTABLE', 'This brief version is immutable.');
      }
      project.workflowStatus = 'needs_review';
      project.syncStatus = 'not_synced';
      touch(project);
      res.json({ project: await store.saveProject(project, token(req)), brief: editable });
    }),
  );

  protectedApi.post(
    '/projects/:projectId/briefs/current/approve',
    asyncRoute(async (req, res) => {
      const project = await ownedProject(req, store);
      try {
        assertCanApprove(project);
      } catch (error) {
        throw workflowHttpError(error);
      }
      const latest = project.briefVersions.at(-1)!;
      latest.status = 'approved';
      latest.approvedAt = new Date().toISOString();
      latest.approvedBy = userId(req);
      latest.updatedAt = latest.approvedAt;
      project.workflowStatus = 'approved';
      project.syncStatus = 'not_synced';
      touch(project);
      res.json({ project: await store.saveProject(project, token(req)), brief: latest });
    }),
  );

  protectedApi.post(
    '/projects/:projectId/briefs/current/request-changes',
    validateBody(requestChangesInputSchema),
    asyncRoute(async (req, res) => {
      const input = requestChangesInputSchema.parse(req.body);
      const project = await ownedProject(req, store);
      const latest = project.briefVersions.at(-1);
      if (!latest) throw new HttpError(409, 'BRIEF_REQUIRED', 'Generate a brief first.');
      if (latest.status === 'draft') latest.status = 'superseded';
      project.workflowStatus = 'interviewing';
      project.syncStatus = 'not_synced';
      project.currentQuestion = {
        text:
          project.locale === 'th'
            ? `ต้องแก้ส่วน ${input.section}: ${input.reason} กรุณาระบุข้อมูลที่ถูกต้องเพื่อใช้แทนที่`
            : `For ${input.section}, you requested: “${input.reason}”. What should the brief use instead?`,
        dimension: input.dimension,
        rationale: 'A human reviewer requested a focused revision.',
      };
      project.analysis.shouldStop = false;
      project.analysis.stopReason = 'needs_human';
      project.analysis.nextQuestion = project.currentQuestion;
      touch(project);
      res.json({ project: await store.saveProject(project, token(req)) });
    }),
  );

  protectedApi.get(
    '/notion/connect',
    asyncRoute((req, res) =>
      Promise.resolve(res.json({ authorizationUrl: notion.authorizationUrl(userId(req)) })),
    ),
  );

  protectedApi.get(
    '/notion/status',
    asyncRoute(async (req, res) => {
      const connection = await store.getNotionConnection(userId(req), token(req));
      res.json({
        connected: Boolean(connection),
        workspaceName: connection?.workspaceName ?? null,
      });
    }),
  );

  protectedApi.get(
    '/notion/pages',
    asyncRoute(async (req, res) => {
      const { accessToken } = await usableNotionConnection(req, store, notion, config);
      try {
        res.json({ pages: await notion.listPages(accessToken) });
      } catch (error) {
        if (!(error instanceof NotionApiError) || error.status !== 401) throw error;
        const refreshed = await usableNotionConnection(req, store, notion, config, true);
        res.json({ pages: await notion.listPages(refreshed.accessToken) });
      }
    }),
  );

  protectedApi.get(
    '/notion/callback',
    asyncRoute(async (req, res) => {
      const code = z.string().min(1).parse(req.query['code']);
      const state = z.string().min(1).parse(req.query['state']);
      notion.verifyState(state, userId(req));
      const tokenResponse = await notion.exchangeCode(code);
      const now = new Date();
      const encryptionKey = encryptionKeyFor(config);
      await store.saveNotionConnection(
        {
          ownerId: userId(req),
          accessTokenEncrypted: encryptSecret(tokenResponse.access_token, encryptionKey),
          refreshTokenEncrypted: tokenResponse.refresh_token
            ? encryptSecret(tokenResponse.refresh_token, encryptionKey)
            : null,
          workspaceId: tokenResponse.workspace_id,
          workspaceName: tokenResponse.workspace_name ?? null,
          botId: tokenResponse.bot_id ?? null,
          expiresAt: tokenResponse.expires_in
            ? new Date(now.getTime() + tokenResponse.expires_in * 1000).toISOString()
            : null,
          createdAt: now.toISOString(),
          updatedAt: now.toISOString(),
        },
        token(req),
      );
      res.redirect(`${config.APP_URL}/settings?notion=connected`);
    }),
  );

  protectedApi.delete(
    '/notion/disconnect',
    asyncRoute(async (req, res) => {
      await store.deleteNotionConnection(userId(req), token(req));
      res.sendStatus(204);
    }),
  );

  protectedApi.post(
    '/projects/:projectId/notion/parent',
    validateBody(selectNotionParentInputSchema),
    asyncRoute(async (req, res) => {
      const input = selectNotionParentInputSchema.parse(req.body);
      const project = await ownedProject(req, store);
      project.notionParentId = input.parentId;
      touch(project);
      res.json({ project: await store.saveProject(project, token(req)) });
    }),
  );

  protectedApi.post(
    '/projects/:projectId/notion/sync',
    perUserRateLimit(config, 8, 60),
    asyncRoute(async (req, res) => {
      const project = await ownedProject(req, store);
      try {
        assertCanSync(project);
      } catch (error) {
        throw workflowHttpError(error);
      }
      const brief = project.briefVersions.at(-1)!;
      const connection = await usableNotionConnection(req, store, notion, config);
      const now = new Date().toISOString();
      const contentHash = createHash('sha256')
        .update(JSON.stringify({ title: brief.title, sections: brief.sections }))
        .digest('hex');
      const claim = await store.claimNotionSync(
        {
          ownerId: userId(req),
          projectId: project.id,
          briefVersion: brief.version,
          notionPageId: project.notionPageId,
          status: 'syncing',
          errorCode: null,
          operationId: randomUUID(),
          leaseExpiresAt: new Date(Date.now() + 60_000).toISOString(),
          contentHash,
          updatedAt: now,
        },
        token(req),
      );
      if (claim.state === 'conflict') {
        throw new HttpError(
          409,
          'SYNC_CONTENT_CONFLICT',
          'The approved version changed after sync was claimed.',
        );
      }
      if (claim.state === 'synced' && claim.record.notionPageId) {
        project.notionPageId = claim.record.notionPageId;
        project.syncStatus = 'synced';
        project.lastSyncError = null;
        touch(project);
        return res.json({
          project: await store.saveProject(project, token(req)),
          pageId: claim.record.notionPageId,
          status: 'synced',
          idempotent: true,
        });
      }
      if (claim.state === 'syncing') {
        project.syncStatus = 'syncing';
        return res.status(202).json({
          project,
          pageId: claim.record.notionPageId,
          status: 'syncing',
          idempotent: true,
        });
      }
      project.syncStatus = 'syncing';
      touch(project);
      await store.saveProject(project, token(req));
      let pageId = claim.record.notionPageId;
      try {
        const syncInput = {
          accessToken: connection.accessToken,
          parentId: project.notionParentId!,
          existingPageId: pageId ?? project.notionPageId,
          projectId: project.id,
          title: brief.title,
          sections: brief.sections,
          version: brief.version,
          contentHash,
        };
        try {
          pageId = await notion.syncBriefVersion(syncInput);
        } catch (error) {
          if (!(error instanceof NotionApiError) || error.status !== 401) throw error;
          const refreshed = await usableNotionConnection(req, store, notion, config, true);
          pageId = await notion.syncBriefVersion({
            ...syncInput,
            accessToken: refreshed.accessToken,
          });
        }
      } catch (error) {
        const code = error instanceof NotionApiError ? error.message : 'NOTION_UNAVAILABLE';
        await store.completeNotionSync(
          {
            ...claim.record,
            notionPageId: pageId,
            status: 'error',
            errorCode: code,
            leaseExpiresAt: null,
            updatedAt: new Date().toISOString(),
          },
          token(req),
        );
        project.syncStatus = 'error';
        project.lastSyncError = code;
        touch(project);
        await store.saveProject(project, token(req));
        throw new HttpError(
          502,
          'NOTION_SYNC_FAILED',
          'Notion sync failed and can be retried safely.',
        );
      }
      await store.completeNotionSync(
        {
          ...claim.record,
          notionPageId: pageId,
          status: 'synced',
          errorCode: null,
          leaseExpiresAt: null,
          updatedAt: new Date().toISOString(),
        },
        token(req),
      );
      project.notionPageId = pageId;
      project.syncStatus = 'synced';
      project.lastSyncError = null;
      touch(project);
      return res.json({
        project: await store.saveProject(project, token(req)),
        pageId,
        status: 'synced',
        idempotent: false,
      });
    }),
  );

  app.use('/api', protectedApi);
  if (config.SENTRY_DSN) Sentry.setupExpressErrorHandler(app);
  app.use(notFound, normalizeErrors, errorHandler);
  return app;
}

function asyncRoute(handler: (req: Request, res: Response) => Promise<unknown>) {
  return (req: Request, res: Response, next: (error?: unknown) => void) => {
    Promise.resolve(handler(req, res)).catch(next);
  };
}

function validateBody(schema: ZodType) {
  return (req: Request, _res: Response, next: (error?: unknown) => void) => {
    const result = schema.safeParse(req.body);
    if (!result.success)
      return next(new HttpError(400, 'INVALID_INPUT', 'Request body is invalid.'));
    req.body = result.data;
    next();
  };
}

function userId(req: Request): string {
  if (!req.authContext) throw new HttpError(401, 'AUTH_REQUIRED', 'Authentication required.');
  return req.authContext.userId;
}

function token(req: Request): string | undefined {
  return req.authContext?.supabaseToken;
}

async function ownedProject(req: Request, store: ProjectStore): Promise<Project> {
  const project = await store.getProject(userId(req), String(req.params['projectId']), token(req));
  if (!project) throw new HttpError(404, 'PROJECT_NOT_FOUND', 'Project not found.');
  return project;
}

function touch(project: Project) {
  project.updatedAt = new Date().toISOString();
}

function workflowHttpError(error: unknown) {
  if (error instanceof WorkflowConflict)
    return new HttpError(409, 'WORKFLOW_CONFLICT', error.message);
  return error;
}

function normalizeErrors(
  error: unknown,
  _req: Request,
  _res: Response,
  next: (error?: unknown) => void,
) {
  if (error instanceof HttpError) return next(error);
  if (error instanceof ZodError)
    return next(new HttpError(400, 'INVALID_INPUT', 'Request data is invalid.'));
  if (error instanceof SyntaxError)
    return next(new HttpError(400, 'INVALID_JSON', 'Request body must be valid JSON.'));
  if (error instanceof ProjectVersionConflictError)
    return next(
      new HttpError(
        409,
        'PROJECT_VERSION_CONFLICT',
        'The project changed in another request. Reload and try again.',
      ),
    );
  next(error);
}

function encryptionKeyFor(config: AppConfig) {
  return config.TOKEN_ENCRYPTION_KEY ?? Buffer.alloc(32, 7).toString('base64');
}

async function usableNotionConnection(
  req: Request,
  store: ProjectStore,
  notion: NotionProvider,
  config: AppConfig,
  forceRefresh = false,
) {
  const connection = await store.getNotionConnection(userId(req), token(req));
  if (!connection) throw new HttpError(409, 'NOTION_NOT_CONNECTED', 'Connect Notion first.');
  const expired = Boolean(connection.expiresAt && Date.parse(connection.expiresAt) <= Date.now());
  if (!forceRefresh && !expired) {
    return {
      accessToken: decryptSecret(connection.accessTokenEncrypted, encryptionKeyFor(config)),
      connection,
    };
  }
  if (!connection.refreshTokenEncrypted) {
    throw new HttpError(401, 'NOTION_RECONNECT_REQUIRED', 'Reconnect Notion to continue.');
  }
  const refreshed = await notion.refreshToken(
    decryptSecret(connection.refreshTokenEncrypted, encryptionKeyFor(config)),
  );
  const now = new Date();
  const updated = {
    ...connection,
    accessTokenEncrypted: encryptSecret(refreshed.access_token, encryptionKeyFor(config)),
    refreshTokenEncrypted: refreshed.refresh_token
      ? encryptSecret(refreshed.refresh_token, encryptionKeyFor(config))
      : connection.refreshTokenEncrypted,
    workspaceId: refreshed.workspace_id || connection.workspaceId,
    workspaceName: refreshed.workspace_name ?? connection.workspaceName,
    botId: refreshed.bot_id ?? connection.botId,
    expiresAt: refreshed.expires_in
      ? new Date(now.getTime() + refreshed.expires_in * 1000).toISOString()
      : connection.expiresAt,
    updatedAt: now.toISOString(),
  };
  await store.saveNotionConnection(updated, token(req));
  return { accessToken: refreshed.access_token, connection: updated };
}
