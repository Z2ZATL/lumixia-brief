# BL-012 — Provider runtime recovery

- Date: 2026-07-15
- Codex Session: `019f614d-cd80-76d3-8151-b8271f575a3f`
- Commit: `7e6fd9c`
- PR: [#20](https://github.com/Z2ZATL/lumixia-brief/pull/20)
- CI: [29393389698](https://github.com/Z2ZATL/lumixia-brief/actions/runs/29393389698)

## Sanitized owner instruction

Continue updating the application until the production runtime is current and the observed API errors are resolved, while keeping the program warning-free and avoiding paid OpenAI calls.

## Incident and decisions

- Proved that a signed-out protected request reached Clerk with no explicit publishable key and became an internal error instead of `401 AUTH_REQUIRED`.
- Passed both configured Clerk credentials to the Express middleware; credentials remain encrypted environment values and are not present in repository evidence.
- Proved that Supabase's current gateway restricts the PostgREST root to secret/service-role credentials even when the public key is valid.
- Rejected adding a service-role key to the application. Added a narrow `security definer` readiness RPC that returns only a boolean, grants execution to `anon` and `authenticated`, and grants no table access.
- Kept the migration forward-only and retained fail-closed behavior: an unavailable RPC still produces HTTP 503 readiness.

## Files changed

- `server/app.ts`
- `server/routes/health.ts`
- `supabase/migrations/202607150002_readiness_probe.sql`
- `tests/api/app.test.ts`
- `tests/integration/rls.test.ts`
- `CODEX_BUILD_LOG.md`
- BL-011 and BL-012 ledger entries

## Verification before merge

- Both new API regression tests failed against the old implementation and pass after the fixes: signed-out protected requests return 401, and readiness uses the intended RPC contract.
- A fresh local database applies all three migrations. All 6 integration tests pass, including proof that `anon` can execute readiness but cannot select project data.
- Formatting, type-aware lint, strict TypeScript, Knip, CSS audit, 27 unit/API tests, 7 UI tests, coverage, build, bundle ceilings, and both dependency audits pass.
- Playwright passes all 6 desktop/mobile and EN/TH scenarios without OpenAI API usage.
- Staged Gitleaks reports no leaks; fake credential-shaped fixtures are assembled at runtime rather than weakening scan policy.

## Final release evidence

The merge SHA, production migration, credential pairing check, deployment ID, custom-domain responses, authenticated browser smoke test, runtime logs, and final CI result will be appended after the verified PR is merged and deployed.

## Remaining live-provider handoffs

- OpenAI live interview and brief generation remain intentionally unverified until API quota is available.
- Notion OAuth/page sync remains a separate interactive live-provider test.
