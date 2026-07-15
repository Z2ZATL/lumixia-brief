# BL-010 — Live integration and deployment hardening

- Date: 2026-07-15
- Codex Session: `019f614d-cd80-76d3-8151-b8271f575a3f`
- Commit: pending (this entry will be updated after the implementation commit exists)
- PR: pending
- CI: pending

## Sanitized owner instruction

Configure the owned application domain and live service credentials, verify the real deployment path, defer paid OpenAI API testing, and keep the repository free of actionable code, build, test, and dependency errors.

## Decisions and user-visible behavior

- Assigned `brief.z2zs.space` to the Vercel project through a DNS-only application record while preserving the existing Google mail route.
- Created a Clerk production instance as an isolated secondary application. Its five delegated DNS records are verified without changing the root mail records.
- Stored production configuration in Vercel encrypted environment variables; no credential values were committed or added to evidence.
- Migrated the server from the deprecated Clerk Supabase JWT template to the native Clerk session token integration.
- Added an API-local TypeScript configuration so Vercel Functions compile with the same ES2023 library contract as local and CI builds.
- Removed the Vercel CLI from repository dependencies and pinned `56.1.0` at command invocation instead. This keeps CLI behavior reproducible without shipping its unrelated framework toolchain and advisories in the dependency graph.
- Deferred further OpenAI calls after the live smoke request reported insufficient quota. Mock model behavior remains the no-cost development and regression path and is not represented as live GPT output.
- Rotated a Notion connection after a credential was exposed to a transient setup surface. Only the replacement credential remains active, and neither value was recorded.

## Files/surfaces changed

- `.github/workflows/release.yml`
- `.env.example`
- `README.md`
- `api/tsconfig.json`
- `package.json`
- `package-lock.json`
- `server/http.ts`
- `tests/unit/security.test.ts`
- `docs/decisions/0003-mfa-rls-privacy.md`
- `docs/security/privacy-model.md`
- Cloudflare DNS, Clerk development/production, Supabase staging/production, Notion OAuth, and Vercel project settings

## Verification

- Formatting, type-aware ESLint, strict TypeScript, Knip, and CSS selector audit pass with zero warnings.
- Unit/API coverage: 24 tests pass; UI regression suite: 7 tests pass.
- Playwright: 6 desktop/mobile/EN-TH scenarios pass without the OpenAI API.
- Empty-database migrations and owner/MFA RLS integration: 5 tests pass against local Supabase.
- Local production build and bundle ceilings pass; production and full dependency audits report zero vulnerabilities after removing the dev-only Vercel dependency.
- Linux/amd64 Docker build passes and runs typecheck, 24 tests, and the production build inside the image (`4a75291f354fb553dda051d433357bc96171783bcb139158b9d91753013b95b9`).
- Vercel Preview `dpl_HLhMSyfHm2MDVxYbwZSd6X6ZePoQ` proved the ES2023 API compiler fix. Preview `dpl_5dPNe1A3vWGGHcHC1NUJ9yhhGuRJ` then built with 0 dependency vulnerabilities and reached `READY`.
- Clerk reports all five production DNS records verified. SSL issuance remains provider-managed and was pending at the last check.

## Handoffs or blockers

- The owner must complete Google Cloud passkey verification before the production Google OAuth client can be created.
- Add and verify the production redirect URI in Notion, then run a real OAuth and duplicate-safe page sync test.
- Adjust Vercel Deployment Protection for the intended public judging path, redeploy the verified commit to production, and check `/`, `/api/health`, and `/api/ready` on the custom domain.
- Mandatory production TOTP remains a Clerk plan decision; no upgrade or purchase was authorized.
- OpenAI live interview and brief generation remain intentionally unverified until API quota is available. Mock output must remain clearly identified in demos and evidence.
