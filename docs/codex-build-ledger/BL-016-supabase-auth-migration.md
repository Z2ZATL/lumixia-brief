# BL-016 — Native Supabase Auth migration

- Date: 2026-07-16
- Codex Session: `019f614d-cd80-76d3-8151-b8271f575a3f`
- Codex model identifier: not exposed to the repository or terminal; intentionally not guessed
- Application live-model target: `gpt-5.6` (disabled during this milestone)
- Commits: `2440e15`, `c725c20`, `ac34101`, `7885587`, `55854cf`, `8455510`, `936a6ad`
- PR: [#24](https://github.com/Z2ZATL/lumixia-brief/pull/24) (draft, stacked on backend PR #23)
- CI: [run 29500510524](https://github.com/Z2ZATL/lumixia-brief/actions/runs/29500510524) — Required CI passed

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
- Added an explicit free-tier guard that keeps Supabase Vector Storage disabled and a regression test that fails if the guard is removed.

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

## Hosted preview evidence

- Vercel Preview deployed commit `7885587b0702b3250dd3761f55907cd968b9f62c` successfully.
- `/api/health` returned `200` with the deployed SHA and `/api/ready` returned `200`.
- A signed-out request to `/api/projects` returned the expected `401 AUTH_REQUIRED` response.
- New native Supabase Auth public variables are configured for Preview and Production. Legacy encrypted variables remain temporarily available only for rollback during the 24-hour soak.
- The forward-only native-AAL2 migration is applied to both hosted Supabase projects. Site URLs, exact callback allowlists, TOTP with at most two factors, disabled phone MFA, disabled email sign-in, and ES256 signing keys were verified.
- `preview.brief.z2zs.space` resolves globally to Vercel and has a valid Vercel alias and certificate.
- Google Cloud reported no billing account for the project. Supabase, Cloudflare, and Vercel remained on free plans; no paid upgrade was accepted.
- A hosted configuration attempt exposed that the CLI could propose paid Vector Storage by default. The provider rejected it with a payment-required response, no upgrade occurred, the staging Auth values were restored immediately, and the repository now contains an explicit disable guard plus regression coverage.
- Dedicated Google OAuth clients were created for staging/local and production, then enabled in their matching Supabase Auth projects. The previous provider's OAuth client remains isolated for the rollback soak.
- A first non-production client secret appeared in sanitized work evidence during credential setup. It was never used by the application; it was immediately replaced, disabled, and permanently deleted before the replacement was connected to Supabase.
- Vercel Authentication was removed from Preview after it intercepted the Google callback. The Preview remains protected by native Google sign-in and mandatory TOTP/AAL2; no paid Deployment Protection add-on was enabled.
- The public Preview returned `200` for `/api/health` with SHA `7885587b0702b3250dd3761f55907cd968b9f62c` and `200` for `/api/ready`. A real Google redirect reached the native TOTP enrollment gate.

## Handoffs and remaining gates

- Complete owner TOTP verification, AAL2 project CRUD, cross-user RLS, refresh, sign-out, and Notion smoke tests.
- Keep the previous provider's encrypted variables and trust configuration only as a rollback boundary during the 24-hour soak. Do not delete external applications, OAuth clients, or DNS records yet.
- After a clean 24-hour soak, execute BL-017 to remove the previous provider's Vercel variables, Supabase trust, dedicated OAuth credentials, application, and only its Cloudflare verification/delegation records. Preserve all mail and application DNS records.

## Notion OAuth and flow-audit follow-up

Sanitized owner instruction: retain the working two-factor flow, determine whether the legacy identity application can be deleted, audit the product flow in detail, and repair the Notion connection so authorization opens in a separate browser tab and completes reliably.

- Production was still serving the legacy-auth `main` SHA while the native Supabase Auth work remained in stacked draft PRs #23 and #24. Deleting the legacy application at this point would break production sign-in, so the authorized deletion was deliberately deferred until the native-auth deployment and its production AAL2 smoke test succeed.
- The Notion connect action previously replaced the Lumixia tab after an asynchronous API request. The callback then navigated that same tab back to Settings and had no safe way to notify an original tab. The replacement opens a blank tab synchronously from the user gesture, severs its opener, navigates it to Notion, and exchanges only a static success/cancel/failure message through a same-origin `BroadcastChannel`.
- The callback removes OAuth values from browser history before processing, posts through the AAL2 bearer-authenticated API once under React Strict Mode, notifies the original tab without identifiers or tokens, attempts to close itself, and retains an accessible manual close control.
- The Settings tab refreshes connection status on a valid callback message and on focus as a fallback. All lifecycle requests are abortable and malformed cross-tab messages are ignored.
- The first local browser run exposed an unrelated Lumixia Web V2 process already listening on port 8787. Playwright had reused the wrong process and received 404 health responses. E2E now uses dedicated overrideable ports, configures the Vite proxy explicitly, and refuses to reuse an unknown server.
- Regression verification: 16 targeted UI/auth tests, 18 complete UI tests, 89 unit/API tests with 95.13% line and 84.31% branch coverage, 11 local Supabase Auth/RLS integration tests, 8 serialized desktop/mobile E2E tests, static clean gate, production build and bundle gate, zero dependency vulnerabilities, and Linux/amd64 Docker build all passed.
- The live Notion developer console still contained three obsolete `/api/notion/callback` values. They were replaced with exact local, stable Preview, and Production `/notion/callback` URLs; the console confirmed `Connection updated`. Client credentials and workspace permissions were not changed.
- The first live callback then returned `403 ORIGIN_DENIED` before provider exchange. A signed-out synthetic request reproduced the same result and proved that Preview still allowlisted a temporary Vercel origin. Preview `APP_URL`, `ALLOWED_ORIGIN`, and `NOTION_REDIRECT_URI` were corrected to the stable Preview domain and queued for redeployment with the next commit.
- A real-browser regression now proves that Settings remains open, Notion callback runs in a separate tab, the callback tab closes, the original tab becomes Connected, and disconnect/reconnect remains clean on desktop and mobile. Disconnect returns an explicit JSON `200` instead of a proxy-noisy empty `204` that Chromium reported as `net::ERR_ABORTED` despite completing successfully.
- Live connect/list/sync/duplicate/revision/disconnect smoke remains an owner-authenticated gate after the corrected Preview environment is deployed. No Notion credential, OAuth value, TOTP, user identifier, or project payload was recorded.
