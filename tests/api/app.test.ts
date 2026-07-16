import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Project } from '../../shared/contracts.js';
import { createApp as createRuntimeApp, type AppDependencies } from '../../server/app.js';
import { loadConfig } from '../../server/config.js';
import { MockModelProvider } from '../../server/providers/model.js';
import { MockNotionProvider } from '../../server/providers/notion.js';
import { MemoryProjectStore } from '../../server/store/memory.js';
import { TestIdentityVerifier, userAHeaders, userBHeaders } from '../helpers/identity.js';

const headers = userAHeaders;

function createApp(dependencies: Omit<AppDependencies, 'identity'>) {
  return createRuntimeApp({
    ...dependencies,
    config: { ...dependencies.config, AUTH_MODE: 'supabase', VITE_AUTH_MODE: 'supabase' },
    identity: new TestIdentityVerifier(),
  });
}

describe('Lumixia API', () => {
  let app: ReturnType<typeof createApp>;
  afterEach(() => vi.restoreAllMocks());

  beforeEach(() => {
    const config = loadConfig({
      NODE_ENV: 'test',
      APP_URL: 'http://localhost:5173',
      ALLOWED_ORIGIN: 'http://localhost:5173',
      MODEL_PROVIDER_MODE: 'mock',
      NOTION_PROVIDER_MODE: 'mock',
      DATA_MODE: 'memory',
    });
    app = createApp({
      config,
      store: new MemoryProjectStore(),
      model: new MockModelProvider(),
      notion: new MockNotionProvider(),
    });
  });

  it('denies AAL1 and cross-owner reads', async () => {
    await request(app)
      .get('/api/projects')
      .set({ ...headers, authorization: 'Bearer test-aal1' })
      .expect(403);
    const created = await createProject(app);
    await request(app).get(`/api/projects/${created.id}`).set(userBHeaders).expect(404);
  });

  it('sets an allowlisted CSP on public responses', async () => {
    const response = await request(app).get('/api/health').expect(200);
    expect(response.headers['content-security-policy']).toContain("default-src 'self'");
    expect(response.headers['content-security-policy']).toContain('frame-ancestors');
  });

  it('keeps public health routes independent from authentication', async () => {
    const config = loadConfig({
      NODE_ENV: 'development',
      APP_ENV: 'local',
      APP_URL: 'https://brief.example.com',
      ALLOWED_ORIGIN: 'https://brief.example.com',
      MODEL_PROVIDER_MODE: 'mock',
      NOTION_PROVIDER_MODE: 'mock',
      DATA_MODE: 'memory',
    });
    const publicApp = createApp({
      config,
      store: new MemoryProjectStore(),
      model: new MockModelProvider(),
      notion: new MockNotionProvider(),
    });

    await request(publicApp).get('/api/health').expect(200);
    await request(publicApp).get('/api/ready').expect(200);
  });

  it('rejects signed-out requests before protected handlers run', async () => {
    const config = loadConfig({
      NODE_ENV: 'development',
      APP_ENV: 'local',
      APP_URL: 'https://brief.example.com',
      ALLOWED_ORIGIN: 'https://brief.example.com',
      AUTH_MODE: 'supabase',
      VITE_AUTH_MODE: 'supabase',
      VITE_SUPABASE_URL: 'https://example.supabase.co',
      VITE_SUPABASE_PUBLISHABLE_KEY: 'test-key',
      MODEL_PROVIDER_MODE: 'mock',
      NOTION_PROVIDER_MODE: 'mock',
      DATA_MODE: 'memory',
    });
    const signedOutApp = createApp({
      config,
      store: new MemoryProjectStore(),
      model: new MockModelProvider(),
      notion: new MockNotionProvider(),
    });

    const response = await request(signedOutApp).get('/api/projects').expect(401);
    expect(response.body.error.code).toBe('AUTH_REQUIRED');
  });

  it('probes database readiness through the public RLS-safe RPC', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response('true', { status: 200 }));
    const config = loadConfig({
      NODE_ENV: 'development',
      APP_ENV: 'local',
      APP_URL: 'https://brief.example.com',
      ALLOWED_ORIGIN: 'https://brief.example.com',
      MODEL_PROVIDER_MODE: 'mock',
      NOTION_PROVIDER_MODE: 'mock',
      DATA_MODE: 'supabase',
      VITE_SUPABASE_URL: 'https://example.supabase.co',
      VITE_SUPABASE_PUBLISHABLE_KEY: 'test-key',
    });
    const readinessApp = createApp({
      config,
      store: new MemoryProjectStore(),
      model: new MockModelProvider(),
      notion: new MockNotionProvider(),
    });

    await request(readinessApp).get('/api/ready').expect(200, { ready: true });
    expect(fetchMock).toHaveBeenCalledWith(
      'https://example.supabase.co/rest/v1/rpc/readiness_check',
      expect.objectContaining({
        method: 'POST',
        headers: { apikey: 'test-key', 'content-type': 'application/json' },
        body: '{}',
      }),
    );
  });

  it('fails closed when the distributed rate-limit backend is unavailable', async () => {
    const config = loadConfig({
      NODE_ENV: 'development',
      APP_ENV: 'local',
      APP_URL: 'http://localhost:5173',
      ALLOWED_ORIGIN: 'http://localhost:5173',
      MODEL_PROVIDER_MODE: 'mock',
      NOTION_PROVIDER_MODE: 'mock',
      DATA_MODE: 'supabase',
      VITE_SUPABASE_URL: 'https://example.supabase.co',
      VITE_SUPABASE_PUBLISHABLE_KEY: 'test-key',
    });
    const distributedApp = createApp({
      config,
      store: new MemoryProjectStore(),
      model: new MockModelProvider(),
      notion: new MockNotionProvider(),
    });
    const response = await request(distributedApp).get('/api/projects').set(headers).expect(503);
    expect(response.body.error.code).toBe('RATE_LIMIT_UNAVAILABLE');
  });

  it('serializes interview turns and returns the same pending operation for duplicates', async () => {
    const config = loadConfig({
      NODE_ENV: 'test',
      APP_URL: 'http://localhost:5173',
      ALLOWED_ORIGIN: 'http://localhost:5173',
      MODEL_PROVIDER_MODE: 'mock',
      NOTION_PROVIDER_MODE: 'mock',
      DATA_MODE: 'memory',
    });
    const model = new MockModelProvider();
    const analyze = model.analyzeInterview.bind(model);
    let release: (() => void) | undefined;
    let markStarted: (() => void) | undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const started = new Promise<void>((resolve) => {
      markStarted = resolve;
    });
    model.analyzeInterview = async (project) => {
      markStarted?.();
      await gate;
      return analyze(project);
    };
    app = createApp({
      config,
      store: new MemoryProjectStore(),
      model,
      notion: new MockNotionProvider(),
    });
    const project = await createProject(app);
    const question = project.currentQuestion;
    if (!question) throw new Error('Expected the initial interview question.');
    const clientAnswerId = crypto.randomUUID();
    const payload = {
      clientAnswerId,
      question: question.text,
      dimension: question.dimension,
      answer: 'Founders need a reviewable implementation brief before Codex starts work.',
    };
    const first = request(app)
      .post(`/api/projects/${project.id}/interview/answers`)
      .set(headers)
      .send(payload);
    const firstResult = first.then((response) => response);
    await started;
    const duplicate = await request(app)
      .post(`/api/projects/${project.id}/interview/answers`)
      .set(headers)
      .send(payload)
      .expect(202);
    expect(duplicate.body).toMatchObject({ status: 'pending', idempotent: true });
    const collision = await request(app)
      .post(`/api/projects/${project.id}/interview/answers`)
      .set(headers)
      .send({ ...payload, clientAnswerId: crypto.randomUUID() })
      .expect(409);
    expect(collision.body.error.code).toBe('PROJECT_BUSY');
    release?.();
    expect((await firstResult).status).toBe(200);
    const conflict = await request(app)
      .post(`/api/projects/${project.id}/interview/answers`)
      .set(headers)
      .send({ ...payload, answer: 'Different content under the same client ID.' })
      .expect(409);
    expect(conflict.body.error.code).toBe('IDEMPOTENCY_CONFLICT');
  });

  it('rejects a stale optimistic project revision', async () => {
    const store = new MemoryProjectStore();
    const config = loadConfig({
      NODE_ENV: 'test',
      APP_URL: 'http://localhost:5173',
      ALLOWED_ORIGIN: 'http://localhost:5173',
      MODEL_PROVIDER_MODE: 'mock',
      NOTION_PROVIDER_MODE: 'mock',
      DATA_MODE: 'memory',
    });
    app = createApp({
      config,
      store,
      model: new MockModelProvider(),
      notion: new MockNotionProvider(),
    });
    const created = await createProject(app);
    const first = await store.getProject('user-a', created.id);
    const stale = await store.getProject('user-a', created.id);
    expect(first).not.toBeNull();
    expect(stale).not.toBeNull();
    first!.title = 'First update';
    await store.saveProject(first!);
    stale!.title = 'Stale update';
    await expect(store.saveProject(stale!)).rejects.toThrow('PROJECT_VERSION_CONFLICT');
  });

  it('runs an idempotent interview, immutable approval, and idempotent Notion sync', async () => {
    let project = await createProject(app);
    await request(app).post(`/api/projects/${project.id}/interview/start`).set(headers).expect(200);
    const submittedIds: string[] = [];
    for (let index = 0; index < 6; index += 1) {
      const current = (await request(app).get(`/api/projects/${project.id}`).set(headers)).body
        .project;
      const clientAnswerId = crypto.randomUUID();
      submittedIds.push(clientAnswerId);
      const payload = {
        clientAnswerId,
        question: current.currentQuestion.text,
        dimension: current.currentQuestion.dimension,
        answer: `Specific validated answer ${index} with enough operational detail for the project team.`,
      };
      const response = await request(app)
        .post(`/api/projects/${project.id}/interview/answers`)
        .set(headers)
        .send(payload)
        .expect(200);
      project = response.body.project;
      if (index === 0) {
        const duplicate = await request(app)
          .post(`/api/projects/${project.id}/interview/answers`)
          .set(headers)
          .send(payload)
          .expect(200);
        expect(duplicate.body.idempotent).toBe(true);
        expect(duplicate.body.project.answers).toHaveLength(1);
      }
    }
    expect(project.analysis.shouldStop).toBe(true);
    const generated = await request(app)
      .post(`/api/projects/${project.id}/briefs/generate`)
      .set(headers)
      .expect(201);
    expect(generated.body.brief.version).toBe(1);
    await request(app)
      .post(`/api/projects/${project.id}/briefs/current/approve`)
      .set(headers)
      .expect(200);

    const callback = await request(app)
      .post('/api/notion/callback')
      .set(headers)
      .send({ result: 'success', code: 'mock', state: 'mock' })
      .expect(200);
    expect(callback.body).toEqual({ connected: true, cancelled: false });
    await request(app)
      .post(`/api/projects/${project.id}/notion/parent`)
      .set(headers)
      .send({ parentId: 'parent-page-id' })
      .expect(200);
    const first = await request(app)
      .post(`/api/projects/${project.id}/notion/sync`)
      .set(headers)
      .expect(200);
    const second = await request(app)
      .post(`/api/projects/${project.id}/notion/sync`)
      .set(headers)
      .expect(200);
    expect(second.body.idempotent).toBe(true);
    expect(second.body.pageId).toBe(first.body.pageId);

    const approved = second.body.project.briefVersions.at(-1);
    const revision = await request(app)
      .patch(`/api/projects/${project.id}/briefs/current`)
      .set(headers)
      .send({
        expectedVersion: approved.version,
        title: approved.title,
        sections: approved.sections,
      })
      .expect(200);
    expect(revision.body.project.briefVersions).toHaveLength(2);
    expect(revision.body.project.briefVersions[0].status).toBe('approved');
    expect(revision.body.project.briefVersions[1].status).toBe('draft');
    const disconnected = await request(app)
      .delete('/api/notion/disconnect')
      .set(headers)
      .expect(200);
    expect(disconnected.body).toEqual({ disconnected: true });
    const status = await request(app).get('/api/notion/status').set(headers).expect(200);
    expect(status.body.connected).toBe(false);
  });

  it('saves failed answers for safe retry', async () => {
    const config = loadConfig({
      NODE_ENV: 'test',
      APP_URL: 'http://localhost:5173',
      ALLOWED_ORIGIN: 'http://localhost:5173',
      MODEL_PROVIDER_MODE: 'mock',
      NOTION_PROVIDER_MODE: 'mock',
      DATA_MODE: 'memory',
    });
    const model = new MockModelProvider();
    const analyze = model.analyzeInterview.bind(model);
    let unavailable = true;
    model.analyzeInterview = async (retryProject) => {
      if (unavailable) throw new Error('simulated timeout');
      return analyze(retryProject);
    };
    app = createApp({
      config,
      store: new MemoryProjectStore(),
      model,
      notion: new MockNotionProvider(),
    });
    const project = await createProject(app);
    const question = project.currentQuestion;
    if (!question) throw new Error('Expected the initial interview question.');
    const clientAnswerId = crypto.randomUUID();
    await request(app)
      .post(`/api/projects/${project.id}/interview/answers`)
      .set(headers)
      .send({
        clientAnswerId,
        question: question.text,
        dimension: 'problem',
        answer: 'A complete answer that remains available after the provider fails.',
      })
      .expect(502);
    const saved = await request(app).get(`/api/projects/${project.id}`).set(headers).expect(200);
    expect(saved.body.project.answers[0]).toMatchObject({
      clientAnswerId,
      status: 'failed',
      errorCode: 'MODEL_UNAVAILABLE',
    });
    unavailable = false;
    const retried = await request(app)
      .post(`/api/projects/${project.id}/interview/answers/${clientAnswerId}/retry`)
      .set(headers)
      .expect(200);
    expect(retried.body).toMatchObject({ status: 'processed', idempotent: false });
    expect(retried.body.project.answers).toHaveLength(1);
  });

  it('refreshes an expired Notion token before listing parent pages', async () => {
    const config = loadConfig({
      NODE_ENV: 'test',
      APP_URL: 'http://localhost:5173',
      ALLOWED_ORIGIN: 'http://localhost:5173',
      MODEL_PROVIDER_MODE: 'mock',
      NOTION_PROVIDER_MODE: 'mock',
      DATA_MODE: 'memory',
    });
    class ExpiringNotionProvider extends MockNotionProvider {
      refreshes = 0;
      override async exchangeCode() {
        return {
          access_token: 'expired-token',
          refresh_token: 'refresh-token',
          workspace_id: 'workspace',
          expires_in: -1,
        };
      }
      override async refreshToken() {
        this.refreshes += 1;
        return {
          access_token: 'fresh-token',
          refresh_token: 'next-refresh-token',
          workspace_id: 'workspace',
          expires_in: 3600,
        };
      }
    }
    const notion = new ExpiringNotionProvider();
    app = createApp({
      config,
      store: new MemoryProjectStore(),
      model: new MockModelProvider(),
      notion,
    });
    await request(app)
      .post('/api/notion/callback')
      .set(headers)
      .send({ result: 'success', code: 'mock', state: 'mock' })
      .expect(200);
    const pages = await request(app).get('/api/notion/pages').set(headers).expect(200);
    expect(pages.body.pages).toHaveLength(2);
    expect(notion.refreshes).toBe(1);
  });
});

async function createProject(app: ReturnType<typeof createApp>): Promise<Project> {
  const response = await request(app)
    .post('/api/projects')
    .set(headers)
    .send({
      title: 'Founder brief',
      initialPrompt: 'Build a launch experience for a founder using Codex.',
      locale: 'en',
    })
    .expect(201);
  return response.body.project as Project;
}
