# BL-008 — Behavior-preserving modular refactor

- Date: 2026-07-15 (Asia/Bangkok)
- Codex Session: `019f614d-cd80-76d3-8151-b8271f575a3f`
- Branch: `agent/modular-refactor`
- Core commit: pending publication
- PR: pending publication
- CI: pending publication

## Sanitized owner instruction

Separate the hardened application into bounded server and client modules without changing verified behavior. Enforce lower complexity and function-length ceilings, preserve all clean gates, prove the client bundle boundary, and record complete test evidence.

## Decisions and behavior preserved

- Reduced `server/app.ts` from about 900 lines to 83 lines containing dependency composition, middleware ordering, and route mounting.
- Split project, interview, brief, and Notion HTTP handlers from services. Services now own workflow transitions, optimistic persistence, idempotency, and provider-operation boundaries.
- Split the Brief screen into section editing, approval controls, alignment evidence, Notion handoff, version history, revision modal, and focused orchestration hooks.
- Split interview submission, stable client-answer ID handling, ambiguous-request recovery, retry, and generation orchestration from the rendering components.
- Split the project list, landing page, and settings page where needed so every production function remains at or below 80 lines.
- Lowered the ESLint complexity ceiling from 25 to 15 and added a production function-length ceiling of 80 without disable comments.
- Added a build-time client boundary that rejects `server/**` or Zod modules in browser chunks.
- Added a CSS quality gate that rejects duplicate selectors in the same scope and class selectors without source consumers.

## Defects caught during the refactor

- API regression tests found an answer object reference that became stale after a cloned store save. The service now reacquires the saved answer by ID before changing its status.
- Browser-console E2E found that aborting completed navigation fetches produced `requestfailed` events. Effects now use unmount lifecycle guards, preserving cancellation safety without a failed happy-path request.

## Files and surfaces changed

- Express composition, shared error normalization, Sentry setup, security headers, request helpers, route modules, and domain services.
- Brief, Interview, Projects, Settings, and Landing page modules plus their feature components and orchestration hooks.
- Client orchestration regression tests, CSS audit, client-bundle boundary, ESLint gates, Docker install output, and GitHub Actions quality steps.

## Local verification

- Formatting, strict TypeScript, type-aware ESLint with zero warnings, Knip, and CSS audit: passed.
- Unit/API: 23 passed; UI and client orchestration: 7 passed; Supabase/RLS integration: 5 passed.
- Coverage: 75.86% statements, 67.53% branches, 92.68% functions, and 77.84% lines.
- Playwright EN/TH desktop/mobile: 6 passed with no unexpected console warning/error, page error, failed request, or HTTP error.
- Production build and client-boundary gate: passed; initial bundle 415.86 KB raw / 123.17 KB gzip, below 450 KB / 135 KB.
- CSS audit: 323 selectors and 122 classes with no same-scope duplicates or classes without consumers.
- Production dependency audit: 0 vulnerabilities.
- Docker Linux/amd64 build: passed; runtime dependency installation reported 0 vulnerabilities.
- Trivy critical image scan: 0 findings.

## Handoffs or blockers

- The PR, immutable commit SHA, and hosted CI evidence will be added after publication.
- Development-only Vercel CLI advisories remain separated in `docs/security/development-advisories.md`; production risk remains clean.
- Judge repository invitations remain pending explicit owner confirmation at the time permissions are changed.
