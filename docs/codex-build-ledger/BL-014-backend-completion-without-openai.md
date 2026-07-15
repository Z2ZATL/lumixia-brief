# BL-014 — Backend completion without paid OpenAI usage

- Date: 2026-07-15
- Codex Session: `019f614d-cd80-76d3-8151-b8271f575a3f`
- Codex model identifier: not exposed to the repository or terminal; intentionally not guessed
- Application live-model target: `gpt-5.6`
- Commit: pending publication
- PR: pending publication
- CI: pending publication

## Sanitized owner instruction

Complete the backend, provider isolation, correctness, security, coverage, operator tooling, and release controls while deferring the only paid operation: one live GPT-5.6 Responses API contract smoke test. Record evidence without prompts, answers, secrets, tokens, personal identifiers, or chain-of-thought.

## Decisions and behavior

- Replaced the coupled provider mode with independent model and Notion modes.
- Added an explicit disabled model provider and protected capability endpoint. Production cannot use a model mock; disabled calls return `MODEL_NOT_CONFIGURED` without constructing an OpenAI client.
- Preserved failed interview answers under their original client answer ID so they can be retried after live model enablement. Disabled brief generation creates no version and changes no workflow state.
- Passed request cancellation into provider and database boundaries, validated UUID route parameters and OAuth queries, and mapped invalid/expired/owner-mismatched/denied OAuth state to safe 4xx responses.
- Added a deterministic synthetic founder seed that uses operator credentials outside the application runtime, refuses unconfirmed production writes, prints no owner/secret, and makes no GPT-generation claim.
- Made Vercel Git the sole deployment path. GitHub now gates the exact main SHA with forward-only migrations and independently captures post-deployment health/readiness/SHA evidence.

## Regression defects found during this milestone

- A pre-cancelled Notion operation still entered retry handling. The regression test reproduced three unwanted attempts; the provider now stops before network I/O and aborts immediately during backoff.
- Vercel Preview inherits `NODE_ENV=production`, which previously made Preview follow Production provider rules. `APP_ENV` now owns the deployment classification and invalid combinations fail closed.
- React Strict Mode could abort the first capability request before the replacement effect started, producing a browser `requestfailed` event. Request startup now defers one microtask while preserving real unmount cancellation.
- An interrupted claim-completion write could leave a processed or failed interview answer behind a pending claim. Duplicate recovery now detects the stored answer, repairs the claim, and returns the original terminal result idempotently.

## Surfaces changed

- Backend config, middleware, provider adapters, service boundaries, stores, routes, and shared contracts
- Minimal interview compatibility state and localized disabled-model message
- Unit/API/provider/privacy/operator tests and whole-backend coverage configuration
- GitHub CI migration/deployment-evidence workflows
- Environment example, README, operations/security/submission documentation, and Build Ledger

## Local acceptance evidence

- Format, ESLint with zero warnings, strict TypeScript, Knip, CSS consumer audit, and diff checks: passed
- Unit/API/provider/operator suite: 84 tests passed
- Whole-backend coverage: 94.78% lines, 91.74% statements, 93.12% functions, and 84.23% branches
- Security coverage: 100% lines and 90% branches
- Service/workflow coverage: 94.98% lines and 85.49% branches
- Supabase adapter coverage: 98.30% lines; no backend file has zero coverage
- UI regression suite: 8 tests passed
- Empty-database Supabase migration and RLS integration: 10 tests passed, including aligned AAL2 ownership, AAL1/cross-user denial, claims, leases, concurrency, rate limiting, cascades, and readiness
- Playwright desktop/mobile EN/TH browser-console audit: 6 tests passed with no unexpected warning, error, page error, failed request, or HTTP error
- Production build and bundle gate: passed at 416.47 KB raw and 123.41 KB gzip
- Dependency audit: zero vulnerabilities for all and production dependencies
- Docker Linux/amd64 build: passed; tests and production build also passed inside the image
- Full-history Gitleaks scan: 44 commits, no leaks
- Trivy critical/unfixed container scan: zero critical findings
- OpenAI network requests: zero

## Remaining milestone gates

- Publish the BL-014 commit/PR and attach final CI URLs and exact coverage evidence.
- Perform authenticated live Clerk/Supabase/Notion/observability/rollback checks in BL-015.
- The paid live GPT-5.6 smoke test remains intentionally deferred.
