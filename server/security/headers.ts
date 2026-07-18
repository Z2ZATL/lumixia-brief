import helmet from 'helmet';
import type { AppConfig } from '../config.js';

export function securityHeaders(config: AppConfig) {
  const supabaseOrigin = config.VITE_SUPABASE_URL
    ? new URL(config.VITE_SUPABASE_URL).origin
    : undefined;
  return helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        baseUri: ["'self'"],
        objectSrc: ["'none'"],
        frameAncestors: ["'none'"],
        formAction: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:', 'blob:'],
        fontSrc: ["'self'", 'data:'],
        connectSrc: [
          "'self'",
          ...(supabaseOrigin ? [supabaseOrigin] : []),
          'https://*.sentry.io',
          'http://127.0.0.1:8790',
        ],
        frameSrc: ["'none'"],
        workerSrc: ["'self'", 'blob:'],
        upgradeInsecureRequests: config.NODE_ENV === 'production' ? [] : null,
      },
    },
    crossOriginResourcePolicy: { policy: 'same-site' },
  });
}
