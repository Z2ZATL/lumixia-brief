import express from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { combineSignals, errorHandler, requestDeadline } from '../../server/http.js';

describe('request lifecycle hardening', () => {
  it('aborts downstream work and returns a safe 504 at the deadline', async () => {
    const app = express();
    let signal: AbortSignal | undefined;
    app.use(requestDeadline(5));
    app.get('/slow', (req) => {
      signal = req.requestSignal;
    });
    const response = await request(app).get('/slow').expect(504);
    const body = response.body as { error: { code: string } };
    expect(body.error.code).toBe('REQUEST_TIMEOUT');
    expect(signal?.aborted).toBe(true);
  });

  it('combines cancellation sources and supports an empty source list', () => {
    const first = new AbortController();
    const second = new AbortController();
    const combined = combineSignals(first.signal, second.signal);
    second.abort('cancelled');
    expect(combined.aborted).toBe(true);
    expect(combineSignals().aborted).toBe(false);
    expect(combineSignals(first.signal)).toBe(first.signal);
  });

  it('sanitizes unknown server errors and records no original message in the response', async () => {
    const app = express();
    app.get('/error', () => {
      throw new Error('private provider payload');
    });
    app.use(errorHandler);
    const response = await request(app).get('/error').expect(500);
    const body = response.body as { error: { code: string; message: string } };
    expect(body.error).toMatchObject({
      code: 'INTERNAL_ERROR',
      message: 'The request could not be completed.',
    });
    expect(JSON.stringify(body)).not.toContain('private provider payload');
  });
});
