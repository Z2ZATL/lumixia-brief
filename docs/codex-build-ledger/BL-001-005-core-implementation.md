# BL-001–005 — Core implementation

- Date: 2026-07-14 (Asia/Bangkok)
- Codex Session: `019f614d-cd80-76d3-8151-b8271f575a3f`
- Status: implemented locally; external credentials and production handoffs pending
- Core implementation commit: `794bec991672c200dc69278fff6b38e8944b89a9`

## Sanitized owner instruction

Implement the robust Lumixia Brief Build Week plan end to end: product architecture, adaptive GPT-5.6 interview, confidence evidence, versioned human approval, Clerk/Supabase security, Notion OAuth, polished bilingual UI, tests, CI/CD, observability, documentation, a private GitHub repository, and a complete Codex evidence trail.

## Decisions recorded

- One Vercel project: Vite CDN plus a single Express `/api` function.
- Server-owned state and confidence; model output is strict but never authoritative for score/stop rules.
- Answer claims are persisted before provider work to make repeated submits safe.
- Approved content is an immutable version; later edits clone a draft.
- Notion sync is keyed by project and brief version and reuses the recorded page ID.
- Production fails closed; deterministic adapters exist only for local/test evidence.
- Logs and evidence contain operational metadata only.

## Outputs

- Product: landing, project list, adaptive interview, 8D confidence, evidence, brief review/editor, reject/revise, approval, version list, Notion handoff, EN/TH switch.
- API: projects, interview start/answer/retry, brief generate/edit/approve/request changes/versions, Notion connect/callback/status/pages/disconnect/parent/sync, health/readiness.
- Security: Helmet, exact origin, 32 KB JSON limit, per-user rate limits, Clerk session/MFA verification, owner checks, forced Supabase RLS, OAuth state, AES-256-GCM, scrubbed Sentry/logs.
- Reliability: OpenAI/Notion timeouts and bounded retry, answer and sync idempotency, sanitized errors, immutable approval.
- Delivery: Vercel config, Docker portability build, PR CI, release gate, SBOM, secret/container scans, Dependabot, evidence artifacts.

## Verification performed

- `npm run format:check`
- `npm run lint`
- `npm run typecheck`
- `npm run test` — 14 unit/API/model-contract tests passed
- `npm run test:integration` — 2 empty-database/MFA RLS tests passed against local Supabase in Docker
- `npm run test:e2e` — 4 desktop/mobile demo-path tests passed
- `npm run build`
- `npm run audit:prod` — zero production vulnerabilities at the recorded run
- Real browser walkthrough: landing → create → six adaptive answers → 75% threshold → generated structured brief → +42 Alignment Improvement → approved immutable inputs.
- Visual checks at default desktop viewport and 390×844 mobile viewport.
- Linux/amd64 Docker image built successfully (`lumixia-brief:local`, about 105 MB) with typecheck, 14 tests, and Vite build executed inside the multi-platform build stage.

Final counts and external CI URLs are recorded by CI artifacts after the first push. No live third-party request was made because production credentials were not supplied.

## Handoffs

- Create/configure Clerk, Supabase staging/production, OpenAI, Notion OAuth, Vercel, Sentry, and UptimeRobot.
- Enable repository rules and production environment secrets.
- Perform real Google/TOTP and Notion smoke tests.
- Confirm before inviting judge accounts.
- Record video, publish YouTube, and submit Devpost.
