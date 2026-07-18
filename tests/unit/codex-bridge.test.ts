import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { interviewPrompt } from '../../scripts/codex-bridge/prompts.js';
import { createCodexBridgeApp } from '../../scripts/codex-bridge/server.js';
import { dimensionKeys } from '../../shared/domain.js';
import { makeProject } from '../ui/fixtures.js';

const origin = 'https://brief.z2zs.space';
const token = 'test-token-that-is-long-enough-for-constant-time-comparison';
const analysis = {
  facts: [],
  assumptions: [],
  contradictions: [],
  dimensionAssessments: dimensionKeys.map((dimension) => ({
    dimension,
    level: 'missing' as const,
    rationale: 'Synthetic bridge assessment.',
    evidence: [],
  })),
  nextQuestion: {
    text: 'What outcome should this create?',
    dimension: 'outcome' as const,
    rationale: 'Outcome is still missing.',
  },
  shouldStop: false,
  stopReason: 'continue' as const,
};

function bridgeApp() {
  const runner = {
    model: 'gpt-5.6-sol',
    analyzeInterview: vi.fn().mockResolvedValue(analysis),
    generateBrief: vi.fn().mockResolvedValue({ title: 'Synthetic', sections: {} }),
  };
  return {
    runner,
    app: createCodexBridgeApp({ runner, token, allowedOrigins: new Set([origin]) }),
  };
}

describe('owner-operated Codex bridge', () => {
  it('binds browser calls to an exact origin and bearer token', async () => {
    const { app } = bridgeApp();
    await request(app).get('/health').set('origin', 'https://evil.example').expect(403);
    await request(app).get('/health').set('origin', origin).expect(401);
    const response = await request(app)
      .get('/health')
      .set({ origin, authorization: `Bearer ${token}` })
      .expect(200);
    expect(response.body).toEqual({ ready: true, model: 'gpt-5.6-sol' });
    expect(response.headers['cache-control']).toBe('no-store');
  });

  it('serves an origin-bound same-origin relay without exposing the token to its opener', async () => {
    const { app } = bridgeApp();
    const pair = await request(app).get('/pair').query({ origin }).expect(200);
    expect(pair.headers['content-security-policy']).toContain("connect-src 'self'");
    expect(pair.text).toContain('lumixia:codex-bridge:ready');
    expect(pair.text).toContain('lumixia:codex-bridge:request');
    expect(pair.text).toContain('Keep this window open');
    expect(pair.text).not.toContain('window.close()');
    expect(pair.text).not.toContain('"token":');

    const selfOrigin = 'http://127.0.0.1:8790';
    const health = await request(app)
      .get('/health')
      .set({ host: '127.0.0.1:8790', origin: selfOrigin, authorization: `Bearer ${token}` })
      .expect(200);
    expect(health.headers['access-control-allow-origin']).toBeUndefined();
    expect(health.body).toEqual({ ready: true, model: 'gpt-5.6-sol' });
  });

  it('validates interview input and returns only structured analysis', async () => {
    const { app, runner } = bridgeApp();
    const project = makeProject();
    await request(app)
      .post('/v1/interview')
      .set({ origin, authorization: `Bearer ${token}` })
      .send({ project, clientAnswerId: crypto.randomUUID(), answer: '' })
      .expect(400);
    const response = await request(app)
      .post('/v1/interview')
      .set({ origin, authorization: `Bearer ${token}` })
      .send({
        project,
        clientAnswerId: crypto.randomUUID(),
        answer: 'Founders need a decision-ready brief before implementation begins.',
      })
      .expect(200);
    expect(response.body).toEqual({ result: analysis, model: 'gpt-5.6-sol' });
    expect(runner.analyzeInterview).toHaveBeenCalledTimes(1);
  });

  it('removes identity and Notion fields from the untrusted model context', () => {
    const project = makeProject();
    project.notionPageId = 'private-page';
    const prompt = interviewPrompt(project, crypto.randomUUID(), 'Synthetic answer');
    expect(prompt).not.toContain(project.ownerId);
    expect(prompt).not.toContain('private-page');
    expect(prompt).toContain('UNTRUSTED_PROJECT_DATA');
    expect(prompt).toContain('Do not call tools');
  });
});
