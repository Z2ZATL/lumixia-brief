import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';

const checker = fileURLToPath(new URL('../../scripts/check-bundle.mjs', import.meta.url));
const workspaces: string[] = [];

function runBundleCheck(source: string) {
  const workspace = mkdtempSync(join(tmpdir(), 'lumixia-bundle-policy-'));
  workspaces.push(workspace);
  mkdirSync(join(workspace, 'dist', 'assets'), { recursive: true });
  writeFileSync(
    join(workspace, 'dist', 'index.html'),
    '<script type="module" src="/assets/index.js"></script>',
  );
  writeFileSync(join(workspace, 'dist', 'assets', 'index.js'), source);
  return spawnSync(process.execPath, [checker], { cwd: workspace, encoding: 'utf8' });
}

afterEach(() => {
  for (const workspace of workspaces.splice(0)) {
    rmSync(workspace, { recursive: true, force: true });
  }
});

describe('client bundle authentication residue policy', () => {
  it('accepts a bundle without legacy authentication configuration', () => {
    const result = runBundleCheck('console.log("supabase-auth-only");');

    expect(result.status).toBe(0);
  });

  it.each([
    'const key = "VITE_CLERK_PUBLISHABLE_KEY";',
    'const bypass = "LOCAL_AUTH_BYPASS";',
    'fetch("https://example.clerk.accounts.dev");',
  ])('rejects forbidden runtime residue: %s', (source) => {
    const result = runBundleCheck(source);

    expect(result.status).not.toBe(0);
    expect(`${result.stdout}${result.stderr}`).toContain(
      'Client bundle contains forbidden authentication residue',
    );
  });
});
