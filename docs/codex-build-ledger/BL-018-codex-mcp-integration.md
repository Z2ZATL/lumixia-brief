# BL-018 — Owner-operated Codex MCP integration

- Status: complete; owner-operated Codex MCP is live in Production and the paid model provider remains disabled
- Date started: 2026-07-18
- Codex Session: `019f614d-cd80-76d3-8151-b8271f575a3f`
- Codex model identifier: not exposed to the repository or terminal; intentionally not guessed
- Application live-model target: `gpt-5.6` (disabled throughout this milestone)
- Implementation branch: `agent/codex-mcp-integration`
- Implementation commits: `eca08fe` through `275e246`; rebased main SHA `9b643d2`
- Pull request: [Merged PR #33](https://github.com/Z2ZATL/lumixia-brief/pull/33)
- CI: [PR run 29647183584](https://github.com/Z2ZATL/lumixia-brief/actions/runs/29647183584) and [main run 29647294939](https://github.com/Z2ZATL/lumixia-brief/actions/runs/29647294939) — every required job and the Production migration gate passed

## Sanitized owner instruction

Add a Lumixia Brief connection for Codex so the owner can run the adaptive interview without paying for OpenAI API usage. Preserve MFA, ownership, confidence, human approval, Notion safety, privacy, and the existing disabled live-model gate.

## Decisions and outputs

- Added a stateless Streamable HTTP MCP endpoint with OAuth protected-resource discovery.
- Reused native Supabase Google OAuth, TOTP/AAL2, JWT verification, owner RLS, rate limits, deadlines, and sanitized errors.
- Required an OAuth client identifier in addition to normal browser-session claims.
- Added five bounded tools for project context, idempotent creation, structured interview turns, and structured brief drafts.
- Kept confidence, stop/readiness rules, workflow transitions, and brief versioning server-authoritative.
- Kept approval and Notion sync outside MCP as explicit human-only actions.
- Removed owner, Notion, sync-error, and approver identifiers from every MCP read and write result.
- Made a repeated final interview turn return the stored result instead of failing after the stop gate.
- Added an OAuth consent route, Codex Settings guidance, EN/TH copy, operator runbook, and architecture decision.
- Kept the OpenAI API client unconstructed on this path; no paid model call was made.
- A live Codex initialization exposed that Supabase OAuth Server issues its separate OAuth session as `aal1` even when consent is approved from an AAL2 browser session. The earlier bearer challenge mislabeled this as a scope problem.
- Added a time-bounded owner/client grant that can only be created from direct AAL2 consent. Express and RLS verify it on every Codex request without rewriting the OAuth token's real `aal` claim.
- Added database-level boundaries that allow Codex draft/interview work while independently blocking approval, deletion, and Notion access.
- Fixed the hosted grant verifier to forward the already-verified bearer token to its Supabase RPC client. The earlier implementation validated the JWT correctly but then called the grant RPC as anonymous.

## Regression evidence

- TypeScript strict typecheck and zero-warning ESLint passed.
- Target unit/API suite passed 22 tests.
- MCP API suite passed 14 tests, including discovery, OAuth challenge, tool annotations, idempotent creation, server-enforced interview readiness, draft idempotency, and data-minimizing results.
- UI suite passed 20 tests, including StrictMode-safe consent loading, query scrubbing, email omission, double-submit prevention, and unsafe redirect rejection.
- Full backend coverage suite passed 104 tests: 94.67% lines, 83.26% branches, 91.99% statements, and 91.81% functions.
- Playwright passed 8 desktop/mobile product-path checks without browser-console failures.
- Production build, bundle ceiling, all/production dependency audits, and Linux/amd64 Docker build passed; both audits reported zero vulnerabilities.
- The active local Supabase containers were left unchanged. The fresh Supabase Auth/RLS integration gate remains assigned to GitHub CI for the new forward-only grant migration.
- GitHub run 29646740281 passed quality, coverage, Auth/RLS migration, Playwright console audit, Linux/amd64 container, SBOM, critical scan, secret scan, and Required CI jobs.

## Sanitized hosted evidence

- Staging and Production Supabase OAuth Server are enabled with Dynamic Client Registration, the exact `/oauth/consent` authorization path, and ES256 JWKS on the Free plan.
- Forward-only migration `202607180001` is applied to Staging and Production; Supabase CLI was relinked to Staging after the Production migration.
- Staging `/api/health` and `/api/ready` returned `200`; the deployed health SHA matched `275e246`.
- A fresh OAuth token had the expected issuer, authenticated audience/role, `openid`, OAuth client identifier, valid expiry, and its real `aal1` value. The separate owner/client grant was verified without altering that claim.
- MCP `initialize` returned `200`, server name `lumixia-brief`, and a tools capability.
- A real Codex CLI session using the owner's ChatGPT plan detected `list_projects` and returned the synthetic marker `LUMIXIA_MCP_SMOKE_OK`. The instruction prohibited tool calls, so no project list, prompt, answer, or brief content was read.
- `OPENAI_API_KEY` was absent from this path and no paid OpenAI API request was made.
- Vercel promoted exact main SHA `9b643d2` to `https://brief.z2zs.space`; `/`, `/api/health`, and `/api/ready` returned `200`, and protected-resource metadata advertised the Production Supabase issuer.
- The GitHub Production environment gate was enabled only after the migration, OAuth, deployment, rollback path, and staging smoke were ready. Its forward-only migration rerun completed successfully.
- The global Codex MCP entry now targets `https://brief.z2zs.space/api/mcp`. Production consent was approved through Google/TOTP, and Codex reported a successful OAuth login.
- A second no-tool-call Codex discovery smoke returned `LUMIXIA_PRODUCTION_MCP_OK`. No project data or tool result was requested or recorded.

## Privacy boundary

This entry records only sanitized implementation and verification metadata. It excludes prompts, answers, briefs, tool inputs/results, OAuth tokens, TOTP values, email addresses, user identifiers, secrets, request bodies, and chain-of-thought.

## Hosted acceptance

- [x] Enable Supabase OAuth Server and Dynamic Client Registration without a paid upgrade.
- [x] Confirm the exact `/oauth/consent` path and asymmetric signing.
- [x] Deploy the earlier PR SHA and verify protected-resource discovery plus the unauthenticated challenge.
- [x] Apply the AAL grant migration to Staging and Production and deploy the corrected exact PR SHA to Staging.
- [x] Connect Codex interactively after Google/TOTP and run a no-tool-call discovery smoke.
- [x] Confirm sanitized Staging runtime evidence without exposing identity, OAuth, or project data.
- [x] Merge the reviewed PR and promote the exact main SHA to Production.
- [x] Repeat health, readiness, OAuth discovery, and no-tool-call Codex smoke against Production.

The paid GPT-5.6 Responses API contract smoke remains intentionally separate and disabled.
