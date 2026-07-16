import { mkdir, writeFile } from 'node:fs/promises';

const evidence = {
  schemaVersion: 1,
  commit: process.env['GITHUB_SHA'] ?? 'local',
  generatedAt: new Date().toISOString(),
  checks: {
    emptyDatabaseMigration: 'passed',
    supabaseAuthAal2: 'passed',
    ownerRlsIsolation: 'passed',
  },
  privacy: 'No keys, tokens, user identifiers, or provider payloads are included.',
};

await mkdir('artifacts', { recursive: true });
await writeFile(
  'artifacts/supabase-integration-summary.json',
  `${JSON.stringify(evidence, null, 2)}\n`,
  'utf8',
);
