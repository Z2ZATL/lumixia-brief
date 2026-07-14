# Development dependency advisories

Last reviewed: 2026-07-15 (Asia/Bangkok)

This record separates build-tool exposure from production runtime risk. It does not suppress or reclassify audit results.

## Production runtime

- `npm audit --omit=dev --audit-level=high`: **0 vulnerabilities**.
- Linux/amd64 runtime image scan with Trivy: **0 critical vulnerabilities**.
- The production image installs only runtime dependencies and runs as the unprivileged `node` user.

## Development-only tooling

The full dependency audit reports 31 development-tree findings: 2 low, 7 moderate, 22 high, and 0 critical. The only direct dependency associated with the high-severity chain is the pinned Vercel CLI. `npm audit` proposes Vercel CLI `54.17.3` as a semver-major replacement for the currently pinned `56.1.0`; that is a downgrade across the tool's compatibility boundary, not a safe patch.

The affected packages are not copied into the production image. They are used only for local/CI build and deployment tooling. CI installs dependencies with lifecycle scripts disabled, pins GitHub Actions by full commit SHA, scans secrets and the built runtime image, and gates production dependencies separately.

## Disposition

- Do not run `npm audit fix --force`; it would silently change the pinned deployment tool and could break Build Week compatibility.
- Keep the Vercel CLI pinned for reproducible submission builds.
- Review the advisory chain on each Dependabot update and upgrade when Vercel publishes a compatible release whose resolved tree clears the findings.
- A new high or critical finding in `npm audit --omit=dev` remains a release blocker.
