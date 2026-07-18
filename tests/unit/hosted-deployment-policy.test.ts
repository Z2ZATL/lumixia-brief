import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';

const checker = fileURLToPath(
  new URL('../../scripts/check-hosted-auth-residue.mjs', import.meta.url),
);
const expectedSha = 'a'.repeat(40);
const workspaces: string[] = [];
const servers: Server[] = [];

async function runHostedCheck(options?: { source?: string; protectedStatus?: number }) {
  const workspace = mkdtempSync(join(tmpdir(), 'lumixia-hosted-policy-'));
  workspaces.push(workspace);
  const server = createServer((request, response) => {
    switch (request.url) {
      case '/':
        response.setHeader('Content-Security-Policy', "default-src 'self'");
        response.end('<script type="module" src="/assets/index.js"></script>');
        return;
      case '/assets/index.js':
        response.end(options?.source ?? 'console.log("supabase-auth-only");');
        return;
      case '/api/health':
        response.setHeader('Content-Type', 'application/json');
        response.end(JSON.stringify({ ok: true, sha: expectedSha }));
        return;
      case '/api/ready':
        response.setHeader('Content-Type', 'application/json');
        response.end(JSON.stringify({ ready: true }));
        return;
      case '/api/projects':
        response.statusCode = options?.protectedStatus ?? 401;
        response.end();
        return;
      default:
        response.statusCode = 404;
        response.end();
    }
  });
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Test server did not bind.');

  const result = await new Promise<{ status: number | null; output: string }>((resolve) => {
    const child = spawn(process.execPath, [checker], {
      cwd: workspace,
      env: {
        ...process.env,
        APP_ORIGIN: `http://127.0.0.1:${address.port}`,
        DEPLOYMENT_SHA: expectedSha,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let output = '';
    child.stdout.on('data', (chunk) => (output += String(chunk)));
    child.stderr.on('data', (chunk) => (output += String(chunk)));
    child.on('close', (status) => resolve({ status, output }));
  });
  return {
    ...result,
    artifact: JSON.parse(
      readFileSync(join(workspace, 'artifacts', 'hosted-auth-residue.json'), 'utf8'),
    ) as Record<string, unknown>,
  };
}

afterEach(async () => {
  await Promise.all(
    servers
      .splice(0)
      .map((server) => new Promise<void>((resolve) => server.close(() => resolve()))),
  );
  for (const workspace of workspaces.splice(0)) {
    rmSync(workspace, { recursive: true, force: true });
  }
});

describe('hosted deployment authentication policy', () => {
  it('accepts a healthy Supabase-auth-only deployment', async () => {
    const result = await runHostedCheck();

    expect(result.status).toBe(0);
    expect(result.artifact).toMatchObject({
      shaVerified: true,
      ready: true,
      assetCount: 1,
      forbiddenResidues: [],
      protectedStatus: 401,
    });
  });

  it('rejects legacy authentication residue in a hosted asset', async () => {
    const result = await runHostedCheck({ source: 'const key = "VITE_CLERK_PUBLISHABLE_KEY";' });

    expect(result.status).not.toBe(0);
    expect(result.output).toContain('legacy authentication residue');
  });

  it('rejects an unprotected authenticated route', async () => {
    const result = await runHostedCheck({ protectedStatus: 200 });

    expect(result.status).not.toBe(0);
    expect(result.output).toContain('signed-out protection');
  });
});
