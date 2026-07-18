import { z } from 'zod';

const optionalUrl = z.string().url().optional();

const environmentSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  APP_ENV: z.enum(['local', 'preview', 'production']).default('local'),
  PORT: z.coerce.number().int().positive().default(8787),
  APP_URL: optionalUrl,
  ALLOWED_ORIGIN: optionalUrl,
  VERCEL_BRANCH_URL: z.string().min(1).optional(),
  VERCEL_URL: z.string().min(1).optional(),
  VERCEL_GIT_COMMIT_SHA: z.string().optional(),
  AUTH_MODE: z.enum(['local-demo', 'supabase']).default('local-demo'),
  VITE_AUTH_MODE: z.enum(['local-demo', 'supabase']).default('local-demo'),
  VITE_SUPABASE_URL: optionalUrl,
  VITE_SUPABASE_PUBLISHABLE_KEY: z.string().optional(),
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
  CODEX_MCP_MODE: z.enum(['disabled', 'enabled']).default('enabled'),
  MODEL_PROVIDER_MODE: z.enum(['disabled', 'live', 'mock']).default('mock'),
  NOTION_PROVIDER_MODE: z.enum(['live', 'mock']).default('mock'),
  DATA_MODE: z.enum(['supabase', 'memory']).default('memory'),
});
type EnvironmentConfig = z.infer<typeof environmentSchema>;
type RequiredConfigKey =
  | 'APP_URL'
  | 'NOTION_CLIENT_ID'
  | 'NOTION_CLIENT_SECRET'
  | 'NOTION_REDIRECT_URI'
  | 'OAUTH_STATE_SECRET'
  | 'OPENAI_API_KEY'
  | 'TOKEN_ENCRYPTION_KEY'
  | 'VITE_SUPABASE_PUBLISHABLE_KEY'
  | 'VITE_SUPABASE_URL';

export type AppConfig = ReturnType<typeof loadConfig>;

export function loadConfig(source: NodeJS.ProcessEnv = process.env) {
  const config = environmentSchema.parse(source);
  assertRuntimeModes(config);
  const missing = requiredConfigKeys(config).filter((key) => !config[key]);
  if (missing.length) throw new Error(`Missing configuration: ${missing.sort().join(', ')}`);
  const appUrl = resolveAppUrl(config);
  const mcpResource = `${appUrl}/api/mcp`;

  return {
    ...config,
    APP_URL: appUrl,
    allowedOrigin: config.ALLOWED_ORIGIN ?? appUrl,
    deploymentSha: config.VERCEL_GIT_COMMIT_SHA ?? 'local',
    modelAvailable: config.MODEL_PROVIDER_MODE !== 'disabled',
    codexAvailable: config.CODEX_MCP_MODE === 'enabled',
    mcpResource,
    mcpMetadataUrl: `${appUrl}/.well-known/oauth-protected-resource/api/mcp`,
  };
}

function requiredConfigKeys(config: EnvironmentConfig): RequiredConfigKey[] {
  const needsSupabase = config.DATA_MODE === 'supabase' || config.AUTH_MODE === 'supabase';
  return [
    ...(needsSupabase ? (['VITE_SUPABASE_URL', 'VITE_SUPABASE_PUBLISHABLE_KEY'] as const) : []),
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
    ...(config.APP_ENV === 'production' ? (['APP_URL'] as const) : []),
  ];
}

function assertRuntimeModes(config: EnvironmentConfig): void {
  if (config.NODE_ENV === 'production' && config.APP_ENV === 'local') {
    throw new Error('APP_ENV must be preview or production when NODE_ENV is production.');
  }
  assertAuthenticationModes(config);
  if (config.APP_ENV === 'local') return;
  if (config.AUTH_MODE !== 'supabase') {
    throw new Error('Preview and production require Supabase authentication.');
  }
  if (config.NOTION_PROVIDER_MODE !== 'live' || config.DATA_MODE !== 'supabase') {
    throw new Error('Preview and production require live Notion and Supabase data.');
  }
  if (config.APP_ENV === 'preview' && config.MODEL_PROVIDER_MODE !== 'mock') {
    throw new Error('Preview requires the deterministic mock model provider.');
  }
  if (
    config.APP_ENV === 'preview' &&
    !config.APP_URL &&
    !config.VERCEL_BRANCH_URL &&
    !config.VERCEL_URL
  ) {
    throw new Error('Preview requires APP_URL or the Vercel deployment URL.');
  }
  if (config.APP_ENV === 'production' && config.MODEL_PROVIDER_MODE === 'mock') {
    throw new Error('Production forbids a mock model provider.');
  }
}

function assertAuthenticationModes(config: EnvironmentConfig): void {
  if (config.AUTH_MODE !== config.VITE_AUTH_MODE) {
    throw new Error('AUTH_MODE and VITE_AUTH_MODE must match.');
  }
}

function resolveAppUrl(config: EnvironmentConfig): string {
  if (config.APP_URL) return config.APP_URL;
  if (config.APP_ENV === 'preview') {
    const previewHost = config.VERCEL_BRANCH_URL ?? config.VERCEL_URL;
    if (previewHost) return `https://${previewHost}`;
  }
  return 'http://localhost:5173';
}
