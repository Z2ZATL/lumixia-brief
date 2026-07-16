import { init } from '@sentry/react';
import { sanitizeTelemetryText } from '../shared/telemetry';

export function initializeTelemetry(dsn: string) {
  init({
    dsn,
    sendDefaultPii: false,
    tracesSampleRate: 0.15,
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 0,
    beforeSend(event) {
      delete event.user;
      delete event.request?.data;
      delete event.request?.headers;
      delete event.request?.cookies;
      delete event.request?.query_string;
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
    },
    beforeSendTransaction(event) {
      delete event.user;
      delete event.request?.data;
      delete event.request?.headers;
      delete event.request?.cookies;
      delete event.request?.query_string;
      delete event.contexts;
      delete event.extra;
      scrubMessage(event);
      if (event.request?.url) event.request.url = sanitizeTelemetryText(event.request.url);
      if (event.transaction) event.transaction = sanitizeTelemetryText(event.transaction);
      for (const span of event.spans ?? []) {
        span.data = {};
        if (span.description) span.description = sanitizeTelemetryText(span.description);
      }
      return event;
    },
    beforeBreadcrumb(breadcrumb) {
      delete breadcrumb.data;
      if (breadcrumb.message) breadcrumb.message = sanitizeTelemetryText(breadcrumb.message);
      return breadcrumb;
    },
  });
}

function scrubMessage(event: { message?: string }): void {
  if (event.message) event.message = sanitizeTelemetryText(event.message);
}
