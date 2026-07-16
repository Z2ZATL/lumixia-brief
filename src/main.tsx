import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { App } from './App';
import { AuthProvider } from './auth';
import { I18nProvider } from './i18n';
import './styles.css';

const sentryDsn = import.meta.env['VITE_SENTRY_DSN'] as string | undefined;
if (sentryDsn) {
  void import('./telemetry')
    .then(({ initializeTelemetry }) => initializeTelemetry(sentryDsn))
    .catch(() => undefined);
}

const content = (
  <BrowserRouter>
    <I18nProvider>
      <AuthProvider>
        <App />
      </AuthProvider>
    </I18nProvider>
  </BrowserRouter>
);
createRoot(document.getElementById('root')!).render(<StrictMode>{content}</StrictMode>);
