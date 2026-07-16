import * as Sentry from '@sentry/node';
import type { Express } from 'express';
import { sanitizeTelemetryText } from '../../shared/telemetry.js';
import type { AppConfig } from '../config.js';

export function scrubSentryEvent<T extends Sentry.Event>(event: T): T {
  delete event.request?.data;
  delete event.request?.cookies;
  delete event.request?.headers;
  delete event.request?.query_string;
  delete event.user;
  delete event.contexts;
  delete event.extra;
  scrubMessage(event);
  if (event.request?.url) event.request.url = sanitizeTelemetryText(event.request.url);
  if (event.transaction) event.transaction = sanitizeTelemetryText(event.transaction);
  for (const value of event.exception?.values ?? []) {
    if (value.value) value.value = sanitizeTelemetryText(value.value);
  }
  for (const span of event.spans ?? []) {
    span.data = {};
    if (span.description) span.description = sanitizeTelemetryText(span.description);
  }
  return event;
}

function scrubMessage(event: { message?: string }): void {
  if (event.message) event.message = sanitizeTelemetryText(event.message);
}

export function scrubSentryBreadcrumb(breadcrumb: Sentry.Breadcrumb) {
  delete breadcrumb.data;
  if (breadcrumb.message) breadcrumb.message = sanitizeTelemetryText(breadcrumb.message);
  return breadcrumb;
}

export function initializeSentry(config: AppConfig) {
  if (!config.SENTRY_DSN) return;
  Sentry.init({
    dsn: config.SENTRY_DSN,
    sendDefaultPii: false,
    tracesSampleRate: config.APP_ENV === 'production' ? 0.15 : 1,
    beforeSend: scrubSentryEvent,
    beforeSendTransaction: scrubSentryEvent,
    beforeBreadcrumb: scrubSentryBreadcrumb,
  });
}

export function mountSentryErrors(app: Express, config: AppConfig) {
  if (config.SENTRY_DSN) Sentry.setupExpressErrorHandler(app);
}
