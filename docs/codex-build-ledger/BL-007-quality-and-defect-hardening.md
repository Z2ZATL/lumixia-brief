# BL-007 — Quality and defect hardening

- Date: 2026-07-15 (Asia/Bangkok)
- Codex Session: `019f614d-cd80-76d3-8151-b8271f575a3f`
- Branch: `agent/quality-and-defect-hardening`
- Commits: `01eb77782856f5a8e04a13863534de77e9b5c0f1`, `ae5dc7ff8bdd207311cef616d9426f49177b8818`, `32e4587af471f4ea8a2cf1ed536a886ca118f448`
- PR: <https://github.com/Z2ZATL/lumixia-brief/pull/11>
- CI: <https://github.com/Z2ZATL/lumixia-brief/actions/runs/29361906100> — Required CI passed

## Sanitized owner instruction

Remove actionable warnings, errors, dead code, security gaps, concurrency defects, and provider-sync defects; add regression coverage and robust CI evidence before performing behavior-preserving modular refactoring in a separate PR.

## Decisions and user-visible behavior

- Added adaptive interview turn claims with stable client IDs, payload matching, failure recovery, stale leases, and collision responses.
- Added optimistic project revisions and atomic Supabase RPCs for project saves, interview operations, Notion operations, and distributed rate limits.
- Prevented double project creation and approval after a failed save.
- Made the Brief screen check Notion connection status before requesting pages; all asynchronous page effects now ignore results after unmount.
- Added project deletion confirmation, visible sync state, contradiction evidence, EN/TH coverage, and correct initial document language.
- Made Notion synchronization find deterministic markers, update an existing page, append each version once, split text safely at 2,000 characters, and send at most 100 blocks per request.
- Enforced the Clerk second-factor claim consistently in the API and RLS, fail-closed production rate limiting, request deadlines, CSP allowlists, private production builds, and Sentry payload scrubbing.
- Removed unused dependencies, files, exports, types, and store methods; moved browser-safe confidence/domain code out of server/Zod modules.

## Files and surfaces changed

- React pages, localization, API client, deferred telemetry, and UI regression suite.
- Express security/middleware, model and Notion providers, store interfaces, memory/Supabase implementations, and API contracts.
- Forward-only migration `202607150001_quality_hardening.sql`.
- TypeScript, ESLint, Knip, Playwright, Vite bundle gate, Dependabot, GitHub Actions, and evidence generation.
- Security advisory record and ADR 0005.

## Local verification

- Formatting, strict TypeScript, type-aware ESLint with zero warnings, and Knip: passed.
- Unit/API: 23 passed; UI: 5 passed; Supabase/RLS integration: 5 passed; Playwright EN/TH desktop/mobile: 6 passed.
- E2E console audit: no unexpected warning, error, page error, failed request, or HTTP error.
- Production build: passed with no public source maps; initial bundle 410.62 KB raw / 121.80 KB gzip, below 450 KB / 135 KB.
- Production dependency audit: 0 vulnerabilities.
- Docker Linux/amd64 build: passed; runtime dependencies audited clean inside the image.
- Trivy critical image scan: 0 findings.
- Hosted GitHub Required CI passed quality, Supabase/RLS, Playwright, Linux/amd64 image/SBOM/Trivy, and secret-scan jobs with evidence artifacts.

## Handoffs or blockers

- Development-only Vercel CLI advisories remain documented in `docs/security/development-advisories.md`; no production dependency finding remains.
- Judge repository invitations remain pending explicit owner confirmation at the time permissions are changed.
