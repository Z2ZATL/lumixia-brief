import { z } from 'zod';
import { CodexLocalRunner } from './codex-bridge/runner.js';
import { createCodexBridgeApp } from './codex-bridge/server.js';

const environmentSchema = z.object({
  CODEX_BRIDGE_PORT: z.coerce.number().int().min(1024).max(65_535).default(8790),
  CODEX_BRIDGE_MODEL: z.string().min(1).default('gpt-5.6-sol'),
  CODEX_BRIDGE_TIMEOUT_MS: z.coerce.number().int().min(10_000).max(180_000).default(90_000),
  CODEX_BRIDGE_ALLOWED_ORIGINS: z
    .string()
    .default('http://localhost:5173,http://127.0.0.1:5173,https://brief.z2zs.space'),
});

const config = environmentSchema.parse(process.env);
const allowedOrigins = new Set(
  config.CODEX_BRIDGE_ALLOWED_ORIGINS.split(',').map((origin) => new URL(origin.trim()).origin),
);
const runner = await CodexLocalRunner.create(
  config.CODEX_BRIDGE_MODEL,
  config.CODEX_BRIDGE_TIMEOUT_MS,
);
const app = createCodexBridgeApp({ runner, allowedOrigins });
const server = app.listen(config.CODEX_BRIDGE_PORT, '127.0.0.1', () => {
  process.stdout.write(
    `Lumixia Codex demo bridge ready on 127.0.0.1:${config.CODEX_BRIDGE_PORT} using ${runner.model}. Pair it from Lumixia Connections.\n`,
  );
});

async function shutdown(): Promise<void> {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await runner.close();
}

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    void shutdown().finally(() => process.exit(0));
  });
}
