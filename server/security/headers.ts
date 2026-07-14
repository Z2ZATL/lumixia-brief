import helmet from 'helmet';
import type { AppConfig } from '../config.js';

export function securityHeaders(config: AppConfig) {
  return helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        baseUri: ["'self'"],
        objectSrc: ["'none'"],
        frameAncestors: ["'none'"],
        formAction: ["'self'", 'https://*.clerk.accounts.dev', 'https://*.clerk.com'],
        scriptSrc: [
          "'self'",
          "'unsafe-inline'",
          'https://*.clerk.accounts.dev',
          'https://*.clerk.com',
        ],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:', 'blob:', 'https://img.clerk.com'],
        fontSrc: ["'self'", 'data:'],
        connectSrc: [
          "'self'",
          'https://*.clerk.accounts.dev',
          'https://*.clerk.com',
          'https://*.sentry.io',
        ],
        frameSrc: ['https://*.clerk.accounts.dev', 'https://*.clerk.com'],
        workerSrc: ["'self'", 'blob:'],
        upgradeInsecureRequests: config.NODE_ENV === 'production' ? [] : null,
      },
    },
    crossOriginResourcePolicy: { policy: 'same-site' },
  });
}
