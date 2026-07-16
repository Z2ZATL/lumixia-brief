import type * as Sentry from '@sentry/node';
import * as SentryRuntime from '@sentry/node';
import express from 'express';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { loadConfig } from '../../server/config.js';
import {
  initializeSentry,
  mountSentryErrors,
  scrubSentryBreadcrumb,
  scrubSentryEvent,
} from '../../server/observability/sentry.js';

vi.mock('@sentry/node', () => ({
  init: vi.fn(),
  setupExpressErrorHandler: vi.fn(),
}));

describe('Sentry privacy policy', () => {
  beforeEach(() => vi.clearAllMocks());

  it('removes request content, identity, query strings, and identifiers', () => {
    const event = scrubSentryEvent({
      message: 'user private@example.com token=secret',
      request: {
        data: { answer: 'private answer' },
        cookies: { session: 'secret' },
        headers: { authorization: 'Bearer secret' },
        query_string: 'code=secret',
        url: 'https://brief.example.com/api/projects/11111111-1111-4111-8111-111111111111?code=secret',
      },
      transaction: '/api/projects/11111111-1111-4111-8111-111111111111',
      user: { email: 'private@example.com' },
      contexts: { private: { answer: 'private answer' } },
      extra: { authorization: 'Bearer secret' },
      exception: {
        values: [{ value: 'user private@example.com code=secret' }],
      },
      spans: [
        {
          span_id: '1234567890abcdef',
          trace_id: '1234567890abcdef1234567890abcdef',
          start_timestamp: 1,
          timestamp: 2,
          data: { answer: 'private answer' },
          description: '/api/projects/11111111-1111-4111-8111-111111111111?state=secret',
        },
      ],
    } satisfies Sentry.Event);
    expect(event.request).not.toHaveProperty('data');
    expect(event.request).not.toHaveProperty('headers');
    expect(event.request).not.toHaveProperty('cookies');
    expect(event.request).not.toHaveProperty('query_string');
    expect(event).not.toHaveProperty('user');
    expect(event).not.toHaveProperty('contexts');
    expect(event).not.toHaveProperty('extra');
    expect(event.message).toBe('user [redacted-email] token=[redacted]');
    expect(event.request?.url).not.toContain('code=');
    expect(event.request?.url).not.toContain('11111111');
    expect(event.transaction).toContain('/:id');
    expect(event.exception?.values?.[0]?.value).toBe('user [redacted-email] code=[redacted]');
    expect(event.spans?.[0]?.data).toEqual({});
    expect(event.spans?.[0]?.description).toBe('/api/projects/:id');
  });

  it('drops breadcrumb data and sanitizes its message', () => {
    const breadcrumb = scrubSentryBreadcrumb({
      message: '/api/projects/11111111-1111-4111-8111-111111111111?state=secret',
      data: { payload: 'private' },
    });
    expect(breadcrumb.data).toBeUndefined();
    expect(breadcrumb.message).not.toContain('state=');
    expect(breadcrumb.message).toContain('/:id');
  });

  it('leaves empty optional telemetry fields absent', () => {
    expect(scrubSentryEvent({})).toEqual({});
    expect(scrubSentryBreadcrumb({})).toEqual({});
  });

  it('initializes only when configured and uses the production sampling policy', () => {
    const disabled = loadConfig({ NODE_ENV: 'test', MODEL_PROVIDER_MODE: 'mock' });
    initializeSentry(disabled);
    mountSentryErrors(express(), disabled);
    expect(SentryRuntime.init).not.toHaveBeenCalled();
    expect(SentryRuntime.setupExpressErrorHandler).not.toHaveBeenCalled();

    const preview = loadConfig({
      NODE_ENV: 'test',
      MODEL_PROVIDER_MODE: 'mock',
      SENTRY_DSN: 'https://public@example.ingest.sentry.io/1',
    });
    initializeSentry(preview);
    expect(SentryRuntime.init).toHaveBeenLastCalledWith(
      expect.objectContaining({ sendDefaultPii: false, tracesSampleRate: 1 }),
    );

    const production = { ...preview, APP_ENV: 'production' as const };
    initializeSentry(production);
    const app = express();
    mountSentryErrors(app, production);
    expect(SentryRuntime.init).toHaveBeenLastCalledWith(
      expect.objectContaining({ sendDefaultPii: false, tracesSampleRate: 0.15 }),
    );
    expect(SentryRuntime.setupExpressErrorHandler).toHaveBeenCalledWith(app);
  });
});
