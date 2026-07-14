import { mkdir, writeFile } from 'node:fs/promises';

await mkdir('artifacts', { recursive: true });
const evidence = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  commitSha: process.env['GITHUB_SHA'] ?? 'local',
  runId: process.env['GITHUB_RUN_ID'] ?? 'local',
  runUrl:
    process.env['GITHUB_SERVER_URL'] &&
    process.env['GITHUB_REPOSITORY'] &&
    process.env['GITHUB_RUN_ID']
      ? `${process.env['GITHUB_SERVER_URL']}/${process.env['GITHUB_REPOSITORY']}/actions/runs/${process.env['GITHUB_RUN_ID']}`
      : null,
  node: process.version,
  gates: [
    'format',
    'lint',
    'typecheck',
    'knip',
    'unit-coverage',
    'ui-regression',
    'browser-console',
    'bundle',
    'production-audit',
    'container-scan',
  ],
  privacy:
    'Contains test metadata only; prompts, answers, briefs, tokens, emails, and user IDs are excluded.',
};
await writeFile(
  'artifacts/evidence-summary.json',
  `${JSON.stringify(evidence, null, 2)}\n`,
  'utf8',
);
