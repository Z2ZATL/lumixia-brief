import { describe, expect, it } from 'vitest';
import { createDependencies } from '../../server/app.js';
import { loadConfig } from '../../server/config.js';
import {
  DisabledModelProvider,
  MockModelProvider,
  OpenAIModelProvider,
} from '../../server/providers/model.js';
import { LiveNotionProvider, MockNotionProvider } from '../../server/providers/notion.js';
import { MemoryProjectStore } from '../../server/store/memory.js';
import { SupabaseProjectStore } from '../../server/store/supabase.js';

const production = {
  NODE_ENV: 'production',
  APP_ENV: 'production',
  APP_URL: 'https://brief.example.com',
  ALLOWED_ORIGIN: 'https://brief.example.com',
  VITE_CLERK_PUBLISHABLE_KEY: 'pk_live_example',
  CLERK_SECRET_KEY: 'sk_live_example',
  SUPABASE_URL: 'https://example.supabase.co',
  SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_example',
  NOTION_CLIENT_ID: 'notion-client',
  NOTION_CLIENT_SECRET: 'notion-secret',
  NOTION_REDIRECT_URI: 'https://brief.example.com/api/notion/callback',
  OAUTH_STATE_SECRET: 's'.repeat(32),
  TOKEN_ENCRYPTION_KEY: Buffer.alloc(32, 9).toString('base64'),
  DATA_MODE: 'supabase',
  NOTION_PROVIDER_MODE: 'live',
  LOCAL_AUTH_BYPASS: 'false',
} satisfies NodeJS.ProcessEnv;

describe('runtime configuration', () => {
  it('allows an explicitly disabled model in production without an OpenAI key', () => {
    const config = loadConfig({ ...production, MODEL_PROVIDER_MODE: 'disabled' });
    expect(config.modelAvailable).toBe(false);
    expect(config.OPENAI_API_KEY).toBeUndefined();
  });

  it('requires a key for a live model and forbids a production mock', () => {
    expect(() => loadConfig({ ...production, MODEL_PROVIDER_MODE: 'live' })).toThrow(
      'OPENAI_API_KEY',
    );
    expect(() => loadConfig({ ...production, MODEL_PROVIDER_MODE: 'mock' })).toThrow(
      'forbids a mock',
    );
    expect(
      loadConfig({ ...production, MODEL_PROVIDER_MODE: 'live', OPENAI_API_KEY: 'test-key' })
        .modelAvailable,
    ).toBe(true);
  });

  it('fails closed when live Notion or Supabase configuration is incomplete', () => {
    expect(() =>
      loadConfig({ ...production, APP_URL: undefined, MODEL_PROVIDER_MODE: 'disabled' }),
    ).toThrow('APP_URL');
    expect(() =>
      loadConfig({ ...production, MODEL_PROVIDER_MODE: 'disabled', NOTION_CLIENT_SECRET: '' }),
    ).toThrow('NOTION_CLIENT_SECRET');
    expect(() =>
      loadConfig({ ...production, MODEL_PROVIDER_MODE: 'disabled', DATA_MODE: 'memory' }),
    ).toThrow('live Notion and Supabase');
    expect(() =>
      loadConfig({ ...production, MODEL_PROVIDER_MODE: 'disabled', LOCAL_AUTH_BYPASS: 'true' }),
    ).toThrow('forbidden outside local development');
    expect(() =>
      loadConfig({
        ...production,
        MODEL_PROVIDER_MODE: 'disabled',
        TOKEN_ENCRYPTION_KEY: Buffer.alloc(31).toString('base64'),
      }),
    ).toThrow('exactly 32 bytes');
  });

  it('allows the Vercel preview matrix while rejecting unsafe environment combinations', () => {
    const preview = loadConfig({
      ...production,
      NODE_ENV: 'production',
      APP_ENV: 'preview',
      APP_URL: undefined,
      ALLOWED_ORIGIN: undefined,
      VERCEL_BRANCH_URL: 'lumixia-brief-git-feature.vercel.app',
      VERCEL_URL: 'lumixia-brief-preview.vercel.app',
      MODEL_PROVIDER_MODE: 'mock',
    });
    expect(preview.MODEL_PROVIDER_MODE).toBe('mock');
    expect(preview.APP_URL).toBe('https://lumixia-brief-git-feature.vercel.app');
    expect(preview.allowedOrigin).toBe('https://lumixia-brief-git-feature.vercel.app');
    expect(preview.authBypass).toBe(false);
    expect(() =>
      loadConfig({
        ...production,
        NODE_ENV: 'production',
        APP_ENV: 'preview',
        MODEL_PROVIDER_MODE: 'disabled',
      }),
    ).toThrow('Preview requires');
    expect(() =>
      loadConfig({
        ...production,
        NODE_ENV: 'production',
        APP_ENV: 'preview',
        APP_URL: undefined,
        VERCEL_BRANCH_URL: undefined,
        VERCEL_URL: undefined,
        MODEL_PROVIDER_MODE: 'mock',
      }),
    ).toThrow('APP_URL or the Vercel deployment URL');
    expect(() =>
      loadConfig({ NODE_ENV: 'production', APP_ENV: 'local', MODEL_PROVIDER_MODE: 'mock' }),
    ).toThrow('APP_ENV must be preview or production');
  });

  it('composes independent data, model, and Notion providers', () => {
    const local = createDependencies(
      loadConfig({
        NODE_ENV: 'test',
        MODEL_PROVIDER_MODE: 'mock',
        NOTION_PROVIDER_MODE: 'mock',
        DATA_MODE: 'memory',
      }),
    );
    expect(local.store).toBeInstanceOf(MemoryProjectStore);
    expect(local.model).toBeInstanceOf(MockModelProvider);
    expect(local.notion).toBeInstanceOf(MockNotionProvider);

    const disabled = createDependencies(
      loadConfig({
        ...production,
        NODE_ENV: 'test',
        APP_ENV: 'production',
        MODEL_PROVIDER_MODE: 'disabled',
      }),
    );
    expect(disabled.store).toBeInstanceOf(SupabaseProjectStore);
    expect(disabled.model).toBeInstanceOf(DisabledModelProvider);
    expect(disabled.notion).toBeInstanceOf(LiveNotionProvider);

    const live = createDependencies(
      loadConfig({
        ...production,
        NODE_ENV: 'test',
        APP_ENV: 'production',
        MODEL_PROVIDER_MODE: 'live',
        OPENAI_API_KEY: 'test-key',
      }),
    );
    expect(live.model).toBeInstanceOf(OpenAIModelProvider);
  });
});
