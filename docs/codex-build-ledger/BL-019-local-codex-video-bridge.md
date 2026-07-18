# BL-019 — Local Codex website interview bridge

- Date: 2026-07-18
- Codex Session: `019f614d-cd80-76d3-8151-b8271f575a3f`
- Model observed in the real local smoke: `gpt-5.6-sol`
- Core commit: `367e6c4039c1c829045e1f8ed21a78106bb213fb`
- PR: [#35](https://github.com/Z2ZATL/lumixia-brief/pull/35)
- CI: [Required CI run 29650728441](https://github.com/Z2ZATL/lumixia-brief/actions/runs/29650728441)

## Sanitized owner instruction

Enable the Build Week video to show a user answering inside the Lumixia website, with the owner's local Codex plan producing each next question and the structured brief, then preserve human approval and Notion sync without using a paid OpenAI API key.

## Decisions and user-visible behavior

- Added a loopback-only worker at `127.0.0.1:8790`; it is not hosted on Vercel and is not a public inference service.
- Pairing uses an origin-bound popup and a memory-only random token. No token is printed, placed in a URL, committed, or sent to monitoring.
- Codex runs ephemerally in an empty temporary directory with user configuration, MCP servers, and repository instructions ignored; sandbox is read-only and approvals are disabled.
- Every result must pass strict JSON Schema and the existing server schema. The server remains authoritative for evidence, confidence, question priority, readiness, idempotency, workflow, and versions.
- The local worker receives no Supabase credential and cannot approve, delete, connect Notion, select a parent, or sync.
- Production continues to use `MODEL_PROVIDER_MODE=disabled`; the separate `CODEX_LOCAL_BRIDGE_MODE` only enables authenticated structured-result handoff endpoints.

## Files and surfaces changed

- Local runner/server and shared prompt context under `scripts/codex-bridge/`.
- AAL2-protected local-Codex interview and brief endpoints.
- Client pairing, processing selection, retry, status, EN/TH copy, CSP allowlist, and sign-out cleanup.
- Forward-only failed-turn recovery migration and matching memory-store behavior.
- README, privacy model, runbook, demo script, submission checklist, ADR-0008, and Build Ledger.

## Verification

- Real synthetic local interview smoke passed with eight dimension assessments and a next question.
- Real synthetic local brief smoke passed with all sixteen structured sections.
- Full local browser rehearsal passed: five adaptive turns reached server-owned readiness at 92%, produced a 16-section brief, saved an edit, created an immutable approval snapshot, connected Notion in a separate tab, selected a parent, and synced.
- Repeated Notion sync returned the same page with `idempotent: true`.
- The 1280x720 rehearsal exposed an unreachable sticky-sidebar Sync control. The sidebar now scrolls independently, and desktop/mobile Playwright includes the regression path.
- The full browser path completed with no console warning or error.
- Both real smokes ran with `OPENAI_API_KEY` absent. No model input/output or user content was recorded.
- `npm test`: 109 passed.
- `npm run test:ui`: 21 passed.
- `npm run test:e2e`: 8 passed across desktop and mobile.
- Local Supabase reset applied all forward migrations; Auth/RLS integration: 12 passed.
- Coverage passed at 93.52% lines and 82.81% branches across the backend scope.
- TypeScript, ESLint, Knip, CSS audit, production build, bundle ceiling, full dependency audit, hosted-production residue verification, and Linux/amd64 Docker build passed.
- Bridge regression tests cover exact-origin/token enforcement, safe request validation, structured output, and removal of owner/Notion identifiers from model context.
- Vercel Preview and Production now have the non-sensitive `CODEX_LOCAL_BRIDGE_MODE=enabled` flag; it takes effect only after the corresponding deployment.

## Handoffs or blockers

- Deploy through the normal PR/migration gate so the configured local-bridge capability becomes active on the hosted app.
- Rehearse the authenticated Production browser path and real Notion handoff while the local worker is running.
- Live paid GPT-5.6 Responses API smoke remains intentionally separate and incomplete.
