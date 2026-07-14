import { ClerkProvider } from '@clerk/react';
import * as Sentry from '@sentry/react';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { App } from './App';
import { I18nProvider } from './i18n';
import './styles.css';

const clerkKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY as string | undefined;
const sentryDsn = import.meta.env.VITE_SENTRY_DSN as string | undefined;
if (sentryDsn) {
  Sentry.init({
    dsn: sentryDsn,
    sendDefaultPii: false,
    tracesSampleRate: 0.15,
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 0,
    beforeSend(event) {
      delete event.user;
      delete event.request?.data;
      return event;
    },
  });
}

const content = (
  <BrowserRouter>
    <I18nProvider>
      <App localMode={!clerkKey} />
    </I18nProvider>
  </BrowserRouter>
);
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {clerkKey ? <ClerkProvider publishableKey={clerkKey}>{content}</ClerkProvider> : content}
  </StrictMode>,
);
