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
      if (event.request?.url) event.request.url = sanitizeTelemetryText(event.request.url);
      if (event.transaction) event.transaction = sanitizeTelemetryText(event.transaction);
      return event;
    },
    beforeSendTransaction(event) {
      delete event.user;
      delete event.request?.data;
      delete event.request?.headers;
      delete event.request?.cookies;
      delete event.request?.query_string;
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
