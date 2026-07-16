# BL-016 — Native Supabase Auth migration

- Date: 2026-07-16
- Codex Session: `019f614d-cd80-76d3-8151-b8271f575a3f`
- Codex model identifier: not exposed to the repository or terminal; intentionally not guessed
- Application live-model target: `gpt-5.6` (disabled during this milestone)
- Commit: `2440e15`
- PR: pending
- CI: pending

## Sanitized owner instruction

Replace the legacy identity provider with native Supabase Google OAuth and mandatory TOTP/AAL2, retain a network-isolated local demo, remove unused authentication code, keep the product free of actionable warnings and errors, and defer external provider deletion until a 24-hour production soak succeeds.

## Decisions and user-visible behavior

- Added one PKCE Supabase browser client with persistent sessions, automatic refresh, a single-flight refresh mutex, strict internal return paths, and bearer-only protected requests.
- Added explicit signed-out, OAuth callback, primary enrollment, factor challenge, AAL2-authenticated, and recoverable-error states. Primary TOTP is mandatory; a second verified TOTP is recommended and the UI protects the final factor from removal.
- Replaced cookie-based identity handling with a stateless verifier that validates native Supabase claims, issuer, role, UUID subject, expiry, and `aal2` through JWKS-backed `getClaims`.
- Kept the local demo fixed to one synthetic owner with memory data and mock providers. Preview and Production fail closed unless native Supabase authentication and live Supabase data are configured.
- Reworked the Notion callback into a public React landing route followed by an AAL2 bearer-authenticated POST. OAuth query values are removed from browser history before completion.
- Added a forward-only RLS migration that accepts only native `aal2` claims and continues comparing text owners to `auth.uid()::text`.
- Removed the legacy provider packages, components, middleware, environment contract, CSP domains, test headers, and active documentation references. Historical ledgers and the superseded ADR remain unchanged evidence.
- Added deterministic vendor chunking so the initial application entry is below the established bundle ceiling without suppressing build warnings.
- Replaced the CI Supabase status artifact, which could contain local credentials, with a sanitized pass summary containing no keys, tokens, identities, or provider payloads.
- Kept the paid OpenAI provider disabled and made no live OpenAI request.

## Files and surfaces changed

- React authentication provider, PKCE callback, TOTP enrollment/challenge screens, security manager, account controls, API bearer refresh, and EN/TH messages
- Express identity middleware, configuration matrix, security headers, Sentry scrubbers, Notion callback contract, and request identity propagation
- Supabase Auth configuration, native-AAL2 migration, local Auth/RLS integration harness, and synthetic RFC 6238 test helper
- CI authentication residue gate, sanitized integration evidence, coverage contracts, Docker build behavior, bundle splitting, README, runbook, privacy model, submission checklist, and ADRs

## Verification completed locally

- Static gate: formatting, ESLint with zero warnings, strict TypeScript, Knip, CSS consumer audit, and authentication-residue scan
- Unit/API: 88 tests passed
- UI: 15 tests passed, including mandatory TOTP, last-factor protection, refresh failure, Strict Mode callback idempotency, and URL scrubbing
- Backend coverage: 94.80% lines and 84.26% branches overall; security 94.73% lines and 93.75% branches; Sentry scrubber 100% lines and 90% branches
- Local Supabase Auth/RLS: 11 integration tests passed from an empty database, including AAL1 denial, real TOTP challenge/verification, AAL2 access, and cross-owner isolation
- Browser: 6 Playwright desktop/mobile tests passed with console and unexpected-request audit
- Production build and bundle gate: initial entry 77,228 raw bytes / 20,449 gzip bytes; no oversized-chunk warning
- Dependency audits: zero reported vulnerabilities in full and production dependency trees
- Linux/amd64 Docker image built successfully; Trivy reported zero critical vulnerabilities; Gitleaks scanned 52 commits and reported no leaks
- OpenAI network requests: zero

## Handoffs and remaining gates

- Configure dedicated non-production and production Google OAuth clients in the hosted Supabase projects, exact site/redirect URLs, TOTP, and asymmetric signing keys.
- Add the new Supabase/Auth variables to Vercel Preview and Production, apply the forward-only hosted migrations, deploy the PR, and complete live Google/TOTP/AAL2, owner CRUD, cross-user RLS, refresh, sign-out, and Notion smoke tests.
- Keep the previous provider's encrypted variables and trust configuration only as a rollback boundary during the 24-hour soak. Do not delete external applications, OAuth clients, or DNS records yet.
- After a clean 24-hour soak, execute BL-017 to remove the previous provider's Vercel variables, Supabase trust, dedicated OAuth credentials, application, and only its Cloudflare verification/delegation records. Preserve all mail and application DNS records.
