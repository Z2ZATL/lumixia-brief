import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../server/app.js';
import { loadConfig } from '../../server/config.js';
import { MockModelProvider } from '../../server/providers/model.js';
import { MockNotionProvider } from '../../server/providers/notion.js';
import { MemoryProjectStore } from '../../server/store/memory.js';

const headers = { 'x-test-user': 'user-a', 'x-test-aal': 'aal2', origin: 'http://localhost:5173' };

describe('Lumixia API', () => {
  let app: ReturnType<typeof createApp>;
  beforeEach(() => {
    const config = loadConfig({
      NODE_ENV: 'test',
      APP_URL: 'http://localhost:5173',
      ALLOWED_ORIGIN: 'http://localhost:5173',
      LOCAL_AUTH_BYPASS: 'true',
      PROVIDER_MODE: 'mock',
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
      .set({ ...headers, 'x-test-aal': 'aal1' })
      .expect(403);
    const created = await createProject(app);
    await request(app)
      .get(`/api/projects/${created.id}`)
      .set({ ...headers, 'x-test-user': 'user-b' })
      .expect(404);
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
      .get('/api/notion/callback?code=mock&state=mock')
      .set(headers)
      .expect(302);
    expect(callback.headers.location).toContain('/settings');
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
  });

  it('saves failed answers for safe retry', async () => {
    const config = loadConfig({
      NODE_ENV: 'test',
      APP_URL: 'http://localhost:5173',
      ALLOWED_ORIGIN: 'http://localhost:5173',
      LOCAL_AUTH_BYPASS: 'true',
      PROVIDER_MODE: 'mock',
      DATA_MODE: 'memory',
    });
    const model = new MockModelProvider();
    model.analyzeInterview = async () => {
      throw new Error('simulated timeout');
    };
    app = createApp({
      config,
      store: new MemoryProjectStore(),
      model,
      notion: new MockNotionProvider(),
    });
    const project = await createProject(app);
    const clientAnswerId = crypto.randomUUID();
    await request(app)
      .post(`/api/projects/${project.id}/interview/answers`)
      .set(headers)
      .send({
        clientAnswerId,
        question: project.currentQuestion.text,
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
  });

  it('refreshes an expired Notion token before listing parent pages', async () => {
    const config = loadConfig({
      NODE_ENV: 'test',
      APP_URL: 'http://localhost:5173',
      ALLOWED_ORIGIN: 'http://localhost:5173',
      LOCAL_AUTH_BYPASS: 'true',
      PROVIDER_MODE: 'mock',
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
    await request(app).get('/api/notion/callback?code=mock&state=mock').set(headers).expect(302);
    const pages = await request(app).get('/api/notion/pages').set(headers).expect(200);
    expect(pages.body.pages).toHaveLength(2);
    expect(notion.refreshes).toBe(1);
  });
});

async function createProject(app: ReturnType<typeof createApp>) {
  const response = await request(app)
    .post('/api/projects')
    .set(headers)
    .send({
      title: 'Founder brief',
      initialPrompt: 'Build a launch experience for a founder using Codex.',
      locale: 'en',
    })
    .expect(201);
  return response.body.project;
}
