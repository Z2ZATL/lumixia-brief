# BL-011 — Production runtime recovery

- Date: 2026-07-15
- Codex Session: `019f614d-cd80-76d3-8151-b8271f575a3f`
- Commit: `ab0ab71`
- PR: [#19](https://github.com/Z2ZATL/lumixia-brief/pull/19)
- CI: [29391478946](https://github.com/Z2ZATL/lumixia-brief/actions/runs/29391478946)

## Sanitized owner instruction

Bring the deployed application up to date and resolve the production HTTP 500 responses without using paid OpenAI API calls.

## Incident and decisions

- Confirmed that the original production deployment was built before the required Clerk production variables were available, so redeploying the verified commit was necessary.
- Replaced the stale Clerk production public and secret credentials in Vercel encrypted environment variables. No credential values were printed, committed, or added to evidence.
- Reproduced the remaining HTTP 500 response with an invalid Clerk secret and found that Clerk middleware ran before the intended public health routes.
- Mounted liveness and readiness before identity middleware. Protected application routes remain behind Clerk, MFA, ownership checks, validation, and rate limiting.
- Added a post-deployment release gate that polls both public endpoints and fails the release if either endpoint does not return HTTP 200.
- Kept OpenAI live calls disabled during diagnosis and verification.

## Files and surfaces changed

- `.github/workflows/release.yml`
- `server/app.ts`
- `tests/api/app.test.ts`
- Vercel encrypted production environment variables

## Verification before merge

- Regression test proves `/api/health` and `/api/ready` remain available when Clerk authentication initialization would fail.
- Formatting, type-aware lint, strict TypeScript, Knip, CSS audit, 25 unit/API tests, 7 UI tests, coverage, production build, bundle ceilings, and both dependency audits pass.
- Playwright passes all 6 desktop/mobile and EN/TH scenarios without OpenAI API usage.
- Fresh local Supabase migration and all 5 owner/MFA RLS integration tests pass in Docker.
- Staged Gitleaks scan reports no leaks.

## Final release evidence

The merge SHA, production deployment ID, custom-domain health responses, protected-route behavior, and final CI result will be appended after the verified PR is merged and deployed.

## Remaining live-provider handoffs

- OpenAI interview and brief generation remain intentionally unverified until API quota is available.
- A real Google sign-in/MFA smoke test and Notion OAuth/page sync still require their interactive account flows.
