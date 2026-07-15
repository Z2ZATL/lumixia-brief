import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  retries: process.env['CI'] ? 2 : 0,
  reporter: process.env['CI'] ? [['html', { open: 'never' }], ['github']] : 'list',
  use: {
    baseURL: 'http://127.0.0.1:5173',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  webServer: [
    {
      command: 'npm run start:test:api',
      url: 'http://127.0.0.1:8787/api/health',
      reuseExistingServer: !process.env['CI'],
      timeout: 120_000,
      env: {
        LOCAL_AUTH_BYPASS: 'true',
        MODEL_PROVIDER_MODE: 'mock',
        NOTION_PROVIDER_MODE: 'mock',
        DATA_MODE: 'memory',
        APP_URL: 'http://127.0.0.1:5173',
        ALLOWED_ORIGIN: 'http://127.0.0.1:5173',
      },
    },
    {
      command: 'npm run dev:web -- --host 127.0.0.1',
      url: 'http://127.0.0.1:5173',
      reuseExistingServer: !process.env['CI'],
      timeout: 120_000,
    },
  ],
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['iPhone 13'], browserName: 'chromium' } },
  ],
});
