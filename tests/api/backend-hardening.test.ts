import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { createApp as createRuntimeApp, type AppDependencies } from '../../server/app.js';
import { loadConfig } from '../../server/config.js';
import { DisabledModelProvider } from '../../server/providers/model.js';
import { MockModelProvider } from '../../server/providers/model.js';
import { MockNotionProvider } from '../../server/providers/notion.js';
import { MemoryProjectStore } from '../../server/store/memory.js';
import { makeProject } from '../ui/fixtures.js';
import { TestIdentityVerifier, userAHeaders } from '../helpers/identity.js';

const headers = userAHeaders;

function createApp(dependencies: Omit<AppDependencies, 'identity'>) {
  return createRuntimeApp({
    ...dependencies,
    config: { ...dependencies.config, AUTH_MODE: 'supabase', VITE_AUTH_MODE: 'supabase' },
    identity: new TestIdentityVerifier(),
  });
}

function disabledApp(store = new MemoryProjectStore()) {
  const config = loadConfig({
    NODE_ENV: 'test',
    APP_URL: 'http://localhost:5173',
    ALLOWED_ORIGIN: 'http://localhost:5173',
    MODEL_PROVIDER_MODE: 'disabled',
    NOTION_PROVIDER_MODE: 'mock',
    DATA_MODE: 'memory',
  });
  return {
    store,
    app: createApp({
      config,
      store,
      model: new DisabledModelProvider(),
      notion: new MockNotionProvider(),
    }),
  };
}

describe('backend hardening', () => {
  it('protects capabilities and reports the disabled model explicitly', async () => {
    const { app } = disabledApp();
    await request(app)
      .get('/api/capabilities')
      .set('authorization', 'Bearer test-aal1')
      .expect(403);
    await request(app)
      .get('/api/capabilities')
      .set(headers)
      .expect(200, {
        model: { mode: 'disabled', available: false },
        notion: { mode: 'mock', available: true },
      });
  });

  it('rejects invalid UUID parameters as input errors', async () => {
    const { app } = disabledApp();
    const response = await request(app).get('/api/projects/not-a-uuid').set(headers).expect(400);
    expect(response.body.error.code).toBe('INVALID_INPUT');
  });

  it('normalizes malformed, oversized, cross-origin, preflight, and unknown requests', async () => {
    const { app } = disabledApp();
    const malformed = await request(app)
      .post('/api/projects')
      .set({ ...headers, 'content-type': 'application/json' })
      .send('{')
      .expect(400);
    expect(malformed.body.error.code).toBe('INVALID_JSON');

    const oversized = await request(app)
      .post('/api/projects')
      .set({ ...headers, 'content-type': 'application/json' })
      .send(JSON.stringify({ title: 'Large', initialPrompt: 'x'.repeat(40_000), locale: 'en' }))
      .expect(413);
    expect(oversized.body.error.code).toBe('PAYLOAD_TOO_LARGE');

    await request(app)
      .post('/api/projects')
      .set({ ...headers, origin: 'https://evil.example' })
      .send({ title: 'Denied', initialPrompt: 'Denied origin.', locale: 'en' })
      .expect(403);
    await request(app).options('/api/projects').set('origin', 'http://localhost:5173').expect(204);
    await request(app).options('/api/projects').set('origin', 'https://evil.example').expect(403);
    await request(app).get('/api/does-not-exist').set(headers).expect(404);
  });

  it('validates OAuth callback bodies and handles consent denial without browser errors', async () => {
    const { app } = disabledApp();
    const missing = await request(app)
      .post('/api/notion/callback')
      .set(headers)
      .send({})
      .expect(400);
    expect(missing.body.error.code).toBe('INVALID_INPUT');
    const denied = await request(app)
      .post('/api/notion/callback')
      .set(headers)
      .send({ result: 'denied', state: 'mock-state', error: 'access_denied' })
      .expect(200);
    expect(denied.body).toEqual({ connected: false, cancelled: true });
    await request(app)
      .post('/api/notion/callback')
      .set(headers)
      .send({ result: 'success', state: 'one' })
      .expect(400);
  });

  it('lists and deletes projects through the public API contract', async () => {
    const { app } = disabledApp();
    const created = await request(app)
      .post('/api/projects')
      .set(headers)
      .send({ title: 'Disposable', initialPrompt: 'Delete after listing.', locale: 'en' })
      .expect(201);
    const projectId = created.body.project.id as string;
    const listed = await request(app).get('/api/projects').set(headers).expect(200);
    expect(listed.body.projects).toHaveLength(1);
    await request(app).delete(`/api/projects/${projectId}`).set(headers).expect(204);
    await request(app).delete(`/api/projects/${projectId}`).set(headers).expect(404);
  });

  it('stores a disabled-model answer for retry without making an OpenAI request', async () => {
    const { app } = disabledApp();
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const created = await request(app)
      .post('/api/projects')
      .set(headers)
      .send({ title: 'Disabled model', initialPrompt: 'Clarify this project.', locale: 'en' })
      .expect(201);
    const projectId = created.body.project.id as string;
    const clientAnswerId = crypto.randomUUID();
    const response = await request(app)
      .post(`/api/projects/${projectId}/interview/answers`)
      .set(headers)
      .send({
        clientAnswerId,
        question: created.body.project.currentQuestion.text,
        dimension: created.body.project.currentQuestion.dimension,
        answer: 'A decision-ready answer that remains saved for a later retry.',
      })
      .expect(503);
    expect(response.body.error.code).toBe('MODEL_NOT_CONFIGURED');
    const stored = await request(app).get(`/api/projects/${projectId}`).set(headers).expect(200);
    expect(stored.body.project.answers[0]).toMatchObject({
      clientAnswerId,
      status: 'failed',
      errorCode: 'MODEL_NOT_CONFIGURED',
    });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('does not create or mutate a brief when the model is disabled', async () => {
    const store = new MemoryProjectStore();
    const project = makeProject();
    project.answers = Array.from({ length: 5 }, (_, index) => ({
      id: `answer-${index}`,
      clientAnswerId: `client-${index}`,
      question: `Question ${index}`,
      dimension: 'problem' as const,
      text: `Processed answer ${index}`,
      status: 'processed' as const,
      errorCode: null,
      createdAt: project.createdAt,
      processedAt: project.updatedAt,
    }));
    project.analysis.dimensionAssessments = project.analysis.dimensionAssessments.map((item) => ({
      ...item,
      level: 'clear',
    }));
    await store.createProject(project);
    const { app } = disabledApp(store);
    const response = await request(app)
      .post(`/api/projects/${project.id}/briefs/generate`)
      .set(headers)
      .expect(503);
    expect(response.body.error.code).toBe('MODEL_NOT_CONFIGURED');
    const after = await store.getProject('user-a', project.id);
    expect(after?.briefVersions).toEqual([]);
    expect(after?.workflowStatus).toBe('interviewing');
  });

  it('heals a processed project when claim completion was interrupted', async () => {
    class InterruptedCompletionStore extends MemoryProjectStore {
      failOnce = true;
      override async completeInterviewTurn(
        ...args: Parameters<MemoryProjectStore['completeInterviewTurn']>
      ): Promise<void> {
        if (this.failOnce) {
          this.failOnce = false;
          throw new Error('simulated claim completion interruption');
        }
        return super.completeInterviewTurn(...args);
      }
    }
    const store = new InterruptedCompletionStore();
    const config = loadConfig({
      NODE_ENV: 'test',
      APP_URL: 'http://localhost:5173',
      ALLOWED_ORIGIN: 'http://localhost:5173',
      MODEL_PROVIDER_MODE: 'mock',
      NOTION_PROVIDER_MODE: 'mock',
      DATA_MODE: 'memory',
    });
    const app = createApp({
      config,
      store,
      model: new MockModelProvider(),
      notion: new MockNotionProvider(),
    });
    const created = await request(app)
      .post('/api/projects')
      .set(headers)
      .send({
        title: 'Recover claim',
        initialPrompt: 'Recover an interrupted claim.',
        locale: 'en',
      })
      .expect(201);
    const project = created.body.project;
    const payload = {
      clientAnswerId: crypto.randomUUID(),
      question: project.currentQuestion.text,
      dimension: project.currentQuestion.dimension,
      answer: 'A complete answer that was processed before claim finalization failed.',
    };
    await request(app)
      .post(`/api/projects/${project.id}/interview/answers`)
      .set(headers)
      .send(payload)
      .expect(500);
    const recovered = await request(app)
      .post(`/api/projects/${project.id}/interview/answers`)
      .set(headers)
      .send(payload)
      .expect(200);
    expect(recovered.body).toMatchObject({ status: 'processed', idempotent: true });
    expect(recovered.body.project.answers).toHaveLength(1);
  });
});
