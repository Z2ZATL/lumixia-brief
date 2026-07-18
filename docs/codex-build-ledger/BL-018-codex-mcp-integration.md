# BL-018 — Owner-operated Codex MCP integration

- Status: implementation complete; hosted Supabase OAuth activation and live Codex consent smoke pending
- Date started: 2026-07-18
- Codex Session: `019f614d-cd80-76d3-8151-b8271f575a3f`
- Codex model identifier: not exposed to the repository or terminal; intentionally not guessed
- Application live-model target: `gpt-5.6` (disabled throughout this milestone)
- Implementation branch: `agent/codex-mcp-integration`
- Implementation commit: `eca08fe`
- Pull request: [Draft PR #33](https://github.com/Z2ZATL/lumixia-brief/pull/33)
- CI: [run 29642833694](https://github.com/Z2ZATL/lumixia-brief/actions/runs/29642833694) — in progress

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

## Regression evidence

- TypeScript strict typecheck and zero-warning ESLint passed.
- Target unit/API suite passed 22 tests.
- MCP API suite passed 14 tests, including discovery, OAuth challenge, tool annotations, idempotent creation, server-enforced interview readiness, draft idempotency, and data-minimizing results.
- UI suite passed 20 tests, including StrictMode-safe consent loading, query scrubbing, email omission, double-submit prevention, and unsafe redirect rejection.
- Full backend coverage suite passed 104 tests: 94.67% lines, 83.26% branches, 91.99% statements, and 91.81% functions.
- Playwright passed 8 desktop/mobile product-path checks without browser-console failures.
- Production build, bundle ceiling, all/production dependency audits, and Linux/amd64 Docker build passed; both audits reported zero vulnerabilities.
- The active local Supabase containers were left unchanged. The fresh Supabase Auth/RLS integration gate remains assigned to GitHub CI because this milestone adds no database migration.

## Privacy boundary

This entry records only sanitized implementation and verification metadata. It excludes prompts, answers, briefs, tool inputs/results, OAuth tokens, TOTP values, email addresses, user identifiers, secrets, request bodies, and chain-of-thought.

## Remaining hosted acceptance

- [ ] Enable Supabase OAuth Server and Dynamic Client Registration without a paid upgrade.
- [ ] Confirm the exact `/oauth/consent` path and asymmetric signing.
- [ ] Deploy the exact PR SHA and verify protected-resource discovery plus the unauthenticated challenge.
- [ ] Connect Codex interactively, approve consent after Google/TOTP, and run the synthetic smoke path.
- [ ] Confirm sanitized Production logs and revoke the synthetic grant if it is no longer needed.
- [ ] Record commit, PR, CI, deployment, and live evidence links above.

The paid GPT-5.6 Responses API contract smoke remains intentionally separate and disabled.
