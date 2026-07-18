import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const excludedPaths = [
  'CODEX_BUILD_LOG.md',
  'docs/codex-build-ledger/',
  'docs/decisions/0003-mfa-rls-privacy.md',
  'supabase/migrations/202607140001_initial.sql',
  'supabase/migrations/202607150001_quality_hardening.sql',
  'scripts/check-auth-residue.mjs',
  'scripts/check-bundle.mjs',
  'tests/unit/bundle-policy.test.ts',
];
const forbidden = [
  /@clerk\//i,
  /\bCLERK_/,
  /\bclerkMiddleware\b/,
  /\bgetAuth\s*\(/,
  /\bx-test-user\b/,
  /\bx-test-aal\b/,
  /\bLOCAL_AUTH_BYPASS\b/,
  /\bClerk\b/i,
];

const files = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard'], {
  encoding: 'utf8',
})
  .split(/\r?\n/)
  .filter(Boolean)
  .filter((file) => !excludedPaths.some((path) => file === path || file.startsWith(path)));
const violations = [];
for (const file of files) {
  const content = readText(file);
  if (content === null) continue;
  const lines = content.split(/\r?\n/);
  lines.forEach((line, index) => {
    if (forbidden.some((pattern) => pattern.test(line))) {
      violations.push(`${file}:${index + 1}`);
    }
  });
}

if (violations.length) {
  process.stderr.write(`Legacy authentication residue found:\n${violations.join('\n')}\n`);
  process.exit(1);
}
process.stdout.write(`Authentication residue check passed across ${files.length} tracked files.\n`);

function readText(file) {
  try {
    const buffer = readFileSync(file);
    return buffer.includes(0) ? null : buffer.toString('utf8');
  } catch {
    return null;
  }
}
