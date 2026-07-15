# Development dependency advisories

Last reviewed: 2026-07-15 (Asia/Bangkok)

This record separates build-tool exposure from production runtime risk. It does not suppress or reclassify audit results.

## Production runtime

- `npm audit --omit=dev --audit-level=high`: **0 vulnerabilities**.
- Linux/amd64 runtime image scan with Trivy: **0 critical vulnerabilities**.
- The production image installs only runtime dependencies and runs as the unprivileged `node` user.

## Development-only tooling

The full locked dependency audit reports **0 vulnerabilities**. BL-010 removed the Vercel CLI from `devDependencies` because Vercel ignores a project-local CLI during hosted builds and the CLI imported unrelated framework builders into the repository audit graph.

Deployment commands invoke `vercel@56.1.0` explicitly through `npx` instead. This preserves the required tool version without adding its deployment-only transitive packages to the application lockfile or Docker build context. CI installs repository dependencies with lifecycle scripts disabled, pins GitHub Actions by full commit SHA, scans secrets and the built runtime image, and gates both full and production-only dependency audits.

## Disposition

- Do not run `npm audit fix --force`; dependency changes remain reviewed and lockfile-controlled.
- Keep the Vercel CLI version explicit at every invocation and review upgrades independently from application dependencies.
- A high or critical finding in the full locked dependency audit is a quality-gate failure.
- A new high or critical finding in `npm audit --omit=dev` remains a release blocker.
