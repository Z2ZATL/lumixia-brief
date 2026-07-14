import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/unit/**/*.test.ts', 'tests/api/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary', 'html'],
      include: ['server/domain/**/*.ts', 'server/security/**/*.ts', 'server/http.ts'],
      thresholds: { lines: 75, functions: 75, statements: 75, branches: 65 },
    },
  },
});
