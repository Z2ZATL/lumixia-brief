# BL-016 — Native Supabase Auth migration

- Date: 2026-07-16
- Codex Session: `019f614d-cd80-76d3-8151-b8271f575a3f`
- Codex model identifier: not exposed to the repository or terminal; intentionally not guessed
- Application live-model target: `gpt-5.6` (disabled during this milestone)
- Rebased commits through live evidence: `b9617bd`, `818616b`, `cc0b042`, `e7abd05`, `693bd4d`, `65d8463`, `1036607`, `f113630`, `92949e8`, `2d174ef`
- PR: [#24](https://github.com/Z2ZATL/lumixia-brief/pull/24) (rebased onto `main` after backend PR #23 merged)
- CI: [run 29599256679](https://github.com/Z2ZATL/lumixia-brief/actions/runs/29599256679) — Required CI passed before the history-only rebase

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
- Preview was redeployed at SHA `db6c7c82801aa08170e077853e0ad38099c3dab6` and the stable alias returned `200` for health/readiness with the exact SHA. The corrected origin now reaches the protected callback boundary instead of failing origin validation.
- The owner completed native Google sign-in and TOTP verification. The resulting AAL2 session completed authenticated project creation, six adaptive mock-model answers, the 75% readiness stop, structured brief generation, immutable v1 approval, and v2 clone/edit/save/approval without a live OpenAI request.
- Live Notion OAuth completed in a separate tab and the original Settings page changed to Connected. Page listing returned the authorized parents, v1 synced under the selected synthetic-safe parent, and a repeated v1 sync remained on one page.
- The approved v2 revision updated the same Notion page, changed its title to v2, preserved the complete v1 content, and appended complete v2 content including the edited timeline and risks. A direct workspace search returned one matching project page after both the duplicate-v1 and v2 sync operations.
- Browser console inspection returned no warnings or errors. Hosted logs showed successful `2xx` responses for the authenticated project, interview, brief, parent-selection, and Notion sync routes; no prompt, answer, OAuth value, TOTP, token, user identifier, or provider payload was copied into this ledger.
- The remaining live gates are a second-account cross-owner RLS denial, controlled session refresh/sign-out verification, Notion refresh-token expiry rehearsal, and an explicit disconnect/reconnect smoke. External legacy-auth deletion remains deferred until Production uses native Supabase Auth and completes a clean 24-hour soak.
- Backend PR #23 was marked ready and rebase-merged into `main` at `fc1b21b` after all required checks passed. GitHub automatically retargeted PR #24 to `main`; its ten authentication commits were then rebased onto that exact main SHA so the PR retained only the intended 70-file Supabase Auth/Notion migration diff instead of duplicating the backend history.

## Production AAL2 and Notion verification follow-up

- Date: 2026-07-18
- Sanitized owner instruction: the owner confirmed completion of the production second-factor challenge and Notion authorization, then asked Codex to continue verification.
- Production health and readiness returned `200` at the deployed `main` SHA. Signed-out project, capability, and Notion-status requests returned the intentional `401 AUTH_REQUIRED` contract.
- The live browser session reached the AAL2-only project, connection, and security routes. One verified primary TOTP factor was present, the final-factor removal control remained protected, a synthetic project was created successfully, and the session survived a full reload without returning to sign-in.
- Production persisted one encrypted Notion connection and one synthetic project for the same owner. The comparison used only aggregate counts and a boolean owner match; no owner identifier, token, OAuth value, answer, or brief content was captured in evidence.
- A fresh Connections render briefly presented `Not connected` before the asynchronous status request completed, even though the persisted connection was valid. This was a false UI state rather than lost data. The connection panel now exposes an accessible `Checking connection…` state and disables connection actions until the first status response settles.
- Added a UI regression with a deliberately pending status response. It proves that neither `Not connected` nor the connect action is shown before the real status is known, then proves the verified connection appears after resolution.
- Preview retained the previously approved synthetic v2 brief and one idempotently synced Notion page. Production keeps the model disabled and made zero OpenAI requests.
- Local verification after the hosted smoke: static quality gate passed; 89 unit/API tests passed with 95.13% backend line and 84.31% branch coverage; 19 UI tests, production build, bundle gate, full and production dependency audits, and 8 desktop/mobile Playwright tests passed. The Playwright suite includes the separate-tab Notion callback flow with console and failed-request auditing.
- The merged `main` CI and production deployment evidence runs passed. The separate Production migration job is still intentionally skipped because the repository production environment has no release secrets and `PRODUCTION_RELEASE_ENABLED` is not enabled; this remains an operations handoff rather than an application defect.
- False-status regression commit: `a20f247`; draft [PR #27](https://github.com/Z2ZATL/lumixia-brief/pull/27); [Required CI run 29603952907](https://github.com/Z2ZATL/lumixia-brief/actions/runs/29603952907) passed quality, Supabase Auth/RLS integration, desktop/mobile Playwright, Linux/amd64 container/SBOM, secret scan, and aggregate required checks.

## Production release and Notion integrity follow-up

- PR #27 was rebase-merged into `main` at `ab6126f`. Required CI and the deployment evidence workflow passed, and Production health/readiness returned `200` with the exact deployed SHA.
- The GitHub `production` environment now contains only the Supabase access token and project reference required for forward-only migrations. A linked dry run reported that the remote database is current. The release variable remains disabled until every live gate is complete.
- The application rollback rehearsal promoted the prior known-good deployment, verified health/readiness, then promoted the current deployment and reverified the exact SHA. No database rollback was attempted.
- An approved operator-created synthetic founder project was inserted without calling OpenAI. Production synced approved v1 to Notion, then cloned, edited, saved, and approved v2 through the product UI.
- Both v1 and v2 sync records completed successfully and reference one Notion page, proving that the revision updated the existing page rather than creating a duplicate. Browser inspection found no application warning, error, failed request, or page error during the sync path.
- Database evidence confirmed one encrypted Notion connection with a refresh token and no plaintext token. No secret, owner identifier, OAuth value, answer, or brief payload was copied into evidence.
- A refresh audit found that a non-expiring token returned after refresh inherited the old expired timestamp. A regression test now proves that the stale expiry is cleared, preventing a refresh loop.
- The migration workflow no longer requests a long-lived database password. Supabase CLI uses the scoped access token to obtain its temporary database login.
- `MODEL_PROVIDER_MODE=disabled` remained active in Production and no OpenAI request was made.

Remaining live gates: deploy the refresh regression, run the controlled expiry rehearsal, configure scrubbed Sentry and uptime monitors, complete backup-factor and second-account denial evidence, finish the clean 24-hour soak, and execute BL-017 decommissioning.

## Repository-owned uptime baseline

- Added a no-secret scheduled workflow that checks the Production landing page, process health contract, deployed SHA shape, and database readiness every five minutes.
- The workflow records only a sanitized pass statement, uploads no response artifact, and uses the standard GitHub-hosted runner available without Actions usage charges for a public repository.
- This baseline does not replace the independent UptimeRobot signal. External activation remains an owner-confirmed boundary because it creates an account and accepts the provider terms.

## Production observability and isolation evidence

- Date: 2026-07-18
- Sanitized owner instruction: after signing in to the required provider consoles, continue the non-OpenAI production verification until only the paid live-model smoke test and explicitly owner-operated security steps remain.
- The Notion refresh regression shipped in [PR #28](https://github.com/Z2ZATL/lumixia-brief/pull/28) at `33a49f5`. Its Required CI and Production deployment evidence passed, and a controlled expired-token rehearsal refreshed the encrypted connection without retaining the stale expiry or creating another Notion page.
- Repository-owned uptime shipped in [PR #29](https://github.com/Z2ZATL/lumixia-brief/pull/29) at `ba51d49`. [Required CI run 29608625055](https://github.com/Z2ZATL/lumixia-brief/actions/runs/29608625055), [manual uptime run 29608635506](https://github.com/Z2ZATL/lumixia-brief/actions/runs/29608635506), and [Production deployment evidence run 29608694990](https://github.com/Z2ZATL/lumixia-brief/actions/runs/29608694990) passed.
- Production `/`, `/api/health`, and `/api/ready` returned `200`; health exposed the exact `ba51d4984ab0ace711b9371513d4500d159ff152` SHA. Independent UptimeRobot monitors for the same three URLs were all `Up`, used five-minute intervals, and emitted no browser-console warning or error during verification.
- A read-only Production RLS assertion proved that the synthetic owner with `aal2` could read its project, the same owner with `aal1` could not, and a different UUID with `aal2` could not. The evidence retained only three booleans and no token or owner identifier.
- The Production bundle contained the newly generated Sentry client key, verified by a SHA-256 comparison without disclosing the DSN. The ingestion endpoint accepted a synthetic event and Sentry displayed `email=[redacted-email]` and `token=[redacted]`; neither raw synthetic value appeared. Replay remains disabled, default PII collection is disabled, and the previous client key is disabled while retained only as an explicit rollback option.
- A fresh authenticated Projects tab produced zero browser warnings or errors. Vercel Production logs for the preceding hour contained zero warning entries, zero error entries, and zero HTTP `500` responses.
- Vercel Deployment Checks now require both GitHub `Required CI` and `Production migration gate` before Production promotion. The settings persisted after a dashboard reload, and no paid Vercel feature was enabled.
- The environment-only Sentry redeploy preserved the same application SHA, returned health/readiness `200`, and did not enable the paid OpenAI provider. `MODEL_PROVIDER_MODE=disabled` and `PRODUCTION_RELEASE_ENABLED=false` remain deliberate until the remaining security/soak gates complete.
- The post-configuration clean gate passed formatting, zero-warning ESLint, strict TypeScript, Knip, the CSS consumer audit, 90 unit/API tests, 19 UI tests, 11 local Supabase Auth/RLS integration tests, 8 desktop/mobile Playwright tests, the Production build and bundle ceiling, and both dependency audits. Backend coverage was 95.13% lines and 84.31% branches. A Linux/amd64 Docker build repeated typecheck, 90 tests, and the build; Trivy found zero critical vulnerabilities, and Gitleaks scanned 81 commits with zero findings. The temporary portability image was removed after verification.
- Evidence commits: `978ca04`, `f242be9`; [PR #30](https://github.com/Z2ZATL/lumixia-brief/pull/30). [Required CI run 29632456157](https://github.com/Z2ZATL/lumixia-brief/actions/runs/29632456157) passed every quality, Auth/RLS, browser, container/SBOM, Trivy, and secret-scan job.
- The owner verified a second native TOTP factor in Production. A fresh Security render showed both Primary and Backup authenticators, two factor-removal controls, no further add-backup action, and zero browser warning or error. No QR code, manual secret, or one-time code was read or retained.

Remaining gates: complete the conservative 24-hour native-auth soak, execute BL-017 legacy-provider decommissioning, and run the paid live GPT-5.6 contract smoke test when credit is available.
