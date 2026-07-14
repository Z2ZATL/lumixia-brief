# Operations and release runbook

## Environments

| Environment | Clerk                       | Supabase             | Vercel              | Providers                   |
| ----------- | --------------------------- | -------------------- | ------------------- | --------------------------- |
| Local       | bypass or Clerk development | local Docker         | native Vite/Express | deterministic by default    |
| Preview     | Clerk development           | dedicated staging    | PR preview          | live test credentials       |
| Production  | Clerk production            | dedicated production | protected main      | live production credentials |

Never point preview at production Supabase or reuse production token-encryption keys.

## Initial GitHub/Vercel setup

1. Protect `main`: pull request required, branch up to date, **Required CI**, resolved conversations, linear history, no force push; no required reviewer for a solo team.
2. Add GitHub production environment with manual approval.
3. Add repository variable `PRODUCTION_RELEASE_ENABLED=false` until handoff is complete.
4. Install Vercel Git integration for previews and configure a Deployment Check requiring **Required CI**.
5. Add separate preview/production environment variables in Vercel.
6. Add encrypted GitHub release secrets: `SUPABASE_ACCESS_TOKEN`, `SUPABASE_DB_PASSWORD`, `SUPABASE_PROJECT_REF`, `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`.
7. Set `PRODUCTION_RELEASE_ENABLED=true` only after a preview smoke test and rollback rehearsal.

## Release

1. Review the Build Ledger entry and ADR/migration changes.
2. Merge a green, up-to-date PR to `main`.
3. CI repeats every gate and writes evidence artifacts.
4. Production environment approval starts the release.
5. Supabase applies forward-only migrations.
6. Vercel builds and deploys the exact verified SHA.
7. Verify `/`, `/api/health`, `/api/ready`, Google/TOTP, a seeded founder project, and Notion sync.
8. Record deployment URL/SHA and CI URL in the Build Ledger.

## Rollback

- Application: choose the previous known-good Vercel deployment and promote/rollback; verify health and the seeded demo.
- Database: never roll back migration files. Add a forward repair migration compatible with both deployed application versions.
- Provider outage: preserve failed answer/sync state, communicate retry, and avoid manual duplicate creation.

## Uptime and incidents

Configure five-minute UptimeRobot monitors for `/`, `/api/health`, and `/api/ready`. Vercel tracks invocation/latency; Sentry tracks scrubbed errors/traces. Use request ID + deployment SHA to correlate. Do not request user content for first-line diagnosis.

## Scheduled checks before submission

- Empty database migration and RLS test.
- Desktop and 390px Playwright path.
- Real Google/TOTP enrollment and backup-code confirmation.
- Notion consent, page selection, retry, and expired-token refresh.
- OpenAI refusal/timeout/malformed-output fixtures.
- Vercel rollback rehearsal.
- Repository judge access from a non-owner check.
