import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const workflow = readFileSync(new URL('../../.github/workflows/ci.yml', import.meta.url), 'utf8');
const dockerIgnore = readFileSync(new URL('../../.dockerignore', import.meta.url), 'utf8');

describe('production release workflow', () => {
  it('keeps every main deployment pending on the protected production environment', () => {
    const migrationJob = workflow.slice(workflow.indexOf('  production-migration:'));
    const jobCondition = migrationJob.slice(0, migrationJob.indexOf('    needs:'));

    expect(migrationJob).toContain("github.event_name == 'push'");
    expect(migrationJob).toContain("github.ref == 'refs/heads/main'");
    expect(jobCondition).not.toContain('PRODUCTION_RELEASE_ENABLED');
    expect(migrationJob).toContain('environment: production');
    expect(migrationJob).toContain('name: Require an enabled production release');
    expect(migrationJob).toContain('run: test "${{ vars.PRODUCTION_RELEASE_ENABLED }}" = "true"');
    expect(migrationJob.indexOf('Require an enabled production release')).toBeLessThan(
      migrationJob.indexOf('Apply forward-only production migrations'),
    );
  });

  it('includes the guarded workflow in the Docker portability build', () => {
    expect(dockerIgnore).toContain('!.github/workflows/');
    expect(dockerIgnore).toContain('!.github/workflows/ci.yml');
  });
});
