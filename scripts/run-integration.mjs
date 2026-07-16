import { execFileSync, spawnSync } from 'node:child_process';
import path from 'node:path';

const supabase = path.resolve('node_modules', 'supabase', 'dist', 'supabase.js');
const vitest = path.resolve('node_modules', 'vitest', 'vitest.mjs');

let status;
try {
  status = execFileSync(process.execPath, [supabase, 'status', '--output', 'env'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  });
} catch {
  process.stderr.write('Local Supabase must be running before integration tests.\n');
  process.exit(1);
}

const values = parseEnvironment(status);
const required = ['API_URL', 'PUBLISHABLE_KEY', 'SERVICE_ROLE_KEY'];
if (required.some((key) => !values[key])) {
  process.stderr.write('Local Supabase did not expose the required test configuration.\n');
  process.exit(1);
}

const result = spawnSync(
  process.execPath,
  [vitest, 'run', '--config', 'vitest.integration.config.ts'],
  {
    stdio: 'inherit',
    env: {
      ...process.env,
      SUPABASE_TEST_URL: values['API_URL'],
      SUPABASE_TEST_PUBLISHABLE_KEY: values['PUBLISHABLE_KEY'],
      SUPABASE_TEST_SERVICE_ROLE_KEY: values['SERVICE_ROLE_KEY'],
    },
  },
);
process.exit(result.status ?? 1);

function parseEnvironment(output) {
  const values = {};
  for (const line of output.split(/\r?\n/)) {
    const match = /^([A-Z0-9_]+)="?(.*?)"?$/.exec(line.trim());
    if (match?.[1] && match[2] !== undefined) values[match[1]] = match[2];
  }
  return values;
}
