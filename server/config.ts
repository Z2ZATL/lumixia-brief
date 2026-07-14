import { z } from 'zod';

const optionalUrl = z.string().url().optional();

const environmentSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  APP_ENV: z.enum(['local', 'preview', 'production']).default('local'),
  PORT: z.coerce.number().int().positive().default(8787),
  APP_URL: z.string().url().default('http://localhost:5173'),
  ALLOWED_ORIGIN: optionalUrl,
  VERCEL_GIT_COMMIT_SHA: z.string().optional(),
  VITE_CLERK_PUBLISHABLE_KEY: z.string().optional(),
  CLERK_SECRET_KEY: z.string().optional(),
  SUPABASE_URL: optionalUrl,
  SUPABASE_PUBLISHABLE_KEY: z.string().optional(),
  OPENAI_API_KEY: z.string().optional(),
  OPENAI_MODEL: z.string().default('gpt-5.6'),
  NOTION_CLIENT_ID: z.string().optional(),
  NOTION_CLIENT_SECRET: z.string().optional(),
  NOTION_REDIRECT_URI: optionalUrl,
  OAUTH_STATE_SECRET: z.string().min(32).optional(),
  TOKEN_ENCRYPTION_KEY: z.string().optional(),
  SENTRY_DSN: z.string().optional(),
  PROVIDER_MODE: z.enum(['live', 'mock']).default('mock'),
  DATA_MODE: z.enum(['supabase', 'memory']).default('memory'),
  LOCAL_AUTH_BYPASS: z.enum(['true', 'false']).default('false'),
});

export type AppConfig = ReturnType<typeof loadConfig>;

export function loadConfig(source: NodeJS.ProcessEnv = process.env) {
  const config = environmentSchema.parse(source);
  const productionLike = config.NODE_ENV === 'production' || config.APP_ENV === 'production';

  if (productionLike) {
    const missing: string[] = [];
    for (const key of [
      'CLERK_SECRET_KEY',
      'VITE_CLERK_PUBLISHABLE_KEY',
      'SUPABASE_URL',
      'SUPABASE_PUBLISHABLE_KEY',
      'OPENAI_API_KEY',
      'NOTION_CLIENT_ID',
      'NOTION_CLIENT_SECRET',
      'NOTION_REDIRECT_URI',
      'OAUTH_STATE_SECRET',
      'TOKEN_ENCRYPTION_KEY',
    ] as const) {
      if (!config[key]) missing.push(key);
    }
    if (missing.length) throw new Error(`Missing production configuration: ${missing.join(', ')}`);
    if (config.PROVIDER_MODE !== 'live' || config.DATA_MODE !== 'supabase') {
      throw new Error('Production requires PROVIDER_MODE=live and DATA_MODE=supabase.');
    }
    if (config.LOCAL_AUTH_BYPASS === 'true') {
      throw new Error('LOCAL_AUTH_BYPASS is forbidden in production.');
    }
  }

  return {
    ...config,
    allowedOrigin: config.ALLOWED_ORIGIN ?? config.APP_URL,
    deploymentSha: config.VERCEL_GIT_COMMIT_SHA ?? 'local',
    authBypass: config.LOCAL_AUTH_BYPASS === 'true' && !productionLike,
  };
}
