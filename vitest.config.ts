import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/unit/**/*.test.ts', 'tests/api/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary', 'html'],
      include: ['server/**/*.ts'],
      exclude: ['server/dev.ts'],
      thresholds: {
        lines: 85,
        functions: 85,
        statements: 85,
        branches: 75,
        'server/config.ts': { lines: 90, branches: 85 },
        'server/security/**/*.ts': { lines: 90, branches: 85 },
        'server/observability/sentry.ts': { lines: 90, branches: 85 },
        'server/domain/workflow.ts': { lines: 90, branches: 85 },
      },
    },
  },
});
