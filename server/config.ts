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
  TOKEN_ENCRYPTION_KEY: z
    .string()
    .refine((value) => Buffer.from(value, 'base64').length === 32, {
      message: 'TOKEN_ENCRYPTION_KEY must decode to exactly 32 bytes.',
    })
    .optional(),
  SENTRY_DSN: z.string().optional(),
  MODEL_PROVIDER_MODE: z.enum(['disabled', 'live', 'mock']).default('mock'),
  NOTION_PROVIDER_MODE: z.enum(['live', 'mock']).default('mock'),
  DATA_MODE: z.enum(['supabase', 'memory']).default('memory'),
  LOCAL_AUTH_BYPASS: z.enum(['true', 'false']).default('false'),
});
type EnvironmentConfig = z.infer<typeof environmentSchema>;
type RequiredConfigKey =
  | 'CLERK_SECRET_KEY'
  | 'NOTION_CLIENT_ID'
  | 'NOTION_CLIENT_SECRET'
  | 'NOTION_REDIRECT_URI'
  | 'OAUTH_STATE_SECRET'
  | 'OPENAI_API_KEY'
  | 'SUPABASE_PUBLISHABLE_KEY'
  | 'SUPABASE_URL'
  | 'TOKEN_ENCRYPTION_KEY'
  | 'VITE_CLERK_PUBLISHABLE_KEY';

export type AppConfig = ReturnType<typeof loadConfig>;

export function loadConfig(source: NodeJS.ProcessEnv = process.env) {
  const config = environmentSchema.parse(source);
  assertRuntimeModes(config);
  const missing = requiredConfigKeys(config).filter((key) => !config[key]);
  if (missing.length) throw new Error(`Missing configuration: ${missing.sort().join(', ')}`);

  return {
    ...config,
    allowedOrigin: config.ALLOWED_ORIGIN ?? config.APP_URL,
    deploymentSha: config.VERCEL_GIT_COMMIT_SHA ?? 'local',
    authBypass:
      config.LOCAL_AUTH_BYPASS === 'true' &&
      config.APP_ENV === 'local' &&
      config.NODE_ENV !== 'production',
    modelAvailable: config.MODEL_PROVIDER_MODE !== 'disabled',
  };
}

function requiredConfigKeys(config: EnvironmentConfig): RequiredConfigKey[] {
  return [
    ...(config.DATA_MODE === 'supabase'
      ? (['SUPABASE_URL', 'SUPABASE_PUBLISHABLE_KEY'] as const)
      : []),
    ...(config.MODEL_PROVIDER_MODE === 'live' ? (['OPENAI_API_KEY'] as const) : []),
    ...(config.NOTION_PROVIDER_MODE === 'live'
      ? ([
          'NOTION_CLIENT_ID',
          'NOTION_CLIENT_SECRET',
          'NOTION_REDIRECT_URI',
          'OAUTH_STATE_SECRET',
          'TOKEN_ENCRYPTION_KEY',
        ] as const)
      : []),
    ...(config.APP_ENV !== 'local'
      ? (['CLERK_SECRET_KEY', 'VITE_CLERK_PUBLISHABLE_KEY'] as const)
      : []),
  ];
}

function assertRuntimeModes(config: EnvironmentConfig): void {
  if (config.NODE_ENV === 'production' && config.APP_ENV === 'local') {
    throw new Error('APP_ENV must be preview or production when NODE_ENV is production.');
  }
  if (config.APP_ENV === 'local') return;
  if (config.LOCAL_AUTH_BYPASS === 'true') {
    throw new Error('LOCAL_AUTH_BYPASS is forbidden outside local development.');
  }
  if (config.NOTION_PROVIDER_MODE !== 'live' || config.DATA_MODE !== 'supabase') {
    throw new Error('Preview and production require live Notion and Supabase data.');
  }
  if (config.APP_ENV === 'preview' && config.MODEL_PROVIDER_MODE !== 'mock') {
    throw new Error('Preview requires the deterministic mock model provider.');
  }
  if (config.APP_ENV === 'production' && config.MODEL_PROVIDER_MODE === 'mock') {
    throw new Error('Production forbids a mock model provider.');
  }
}
