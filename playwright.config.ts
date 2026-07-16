import { defineConfig, devices } from '@playwright/test';

const apiPort = process.env['E2E_API_PORT'] ?? '8797';
const webPort = process.env['E2E_WEB_PORT'] ?? '5197';
const apiUrl = `http://127.0.0.1:${apiPort}`;
const webUrl = `http://127.0.0.1:${webPort}`;

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  retries: process.env['CI'] ? 2 : 0,
  reporter: process.env['CI'] ? [['html', { open: 'never' }], ['github']] : 'list',
  use: {
    baseURL: webUrl,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  webServer: [
    {
      command: 'npm run start:test:api',
      url: `${apiUrl}/api/health`,
      reuseExistingServer: false,
      timeout: 120_000,
      env: {
        MODEL_PROVIDER_MODE: 'mock',
        NOTION_PROVIDER_MODE: 'mock',
        DATA_MODE: 'memory',
        PORT: apiPort,
        APP_URL: webUrl,
        ALLOWED_ORIGIN: webUrl,
      },
    },
    {
      command: `npm run dev:web -- --host 127.0.0.1 --port ${webPort} --strictPort`,
      url: webUrl,
      reuseExistingServer: false,
      timeout: 120_000,
      env: { API_PROXY_TARGET: apiUrl },
    },
  ],
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['iPhone 13'], browserName: 'chromium' } },
  ],
});
