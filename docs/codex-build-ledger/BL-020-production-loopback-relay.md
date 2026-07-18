# BL-020 — Production loopback popup relay

- Date: 2026-07-18
- Codex Session: `019f614d-cd80-76d3-8151-b8271f575a3f`
- Model observed in local and Production smokes: `gpt-5.6-sol`
- Core commit after rebase: `0a4cd62`
- Evidence commit after rebase: `c1259c0`
- PR: merged [#36](https://github.com/Z2ZATL/lumixia-brief/pull/36)
- PR CI: [29652671243](https://github.com/Z2ZATL/lumixia-brief/actions/runs/29652671243)
- Main CI and migration gate: [29652792201](https://github.com/Z2ZATL/lumixia-brief/actions/runs/29652792201)
- Production deployment evidence: [29652972963](https://github.com/Z2ZATL/lumixia-brief/actions/runs/29652972963)

## Sanitized owner instruction

Fix the Production local-Codex connection failure shown as `ERR_BLOCKED_BY_CLIENT`, preserve the no-API-key demo path, remove actionable browser errors, and verify the complete Build Week flow.

## Evidence and decision

- The owner enabled Chrome local-network access, while Production still reported that the bridge was unavailable.
- The worker was confirmed listening on `127.0.0.1:8790`; an origin-matched command-line request reached it, and a top-level Chrome pairing navigation loaded successfully.
- The failing boundary was the Production HTTPS page's direct HTTP loopback fetch after pairing.
- ADR-0009 keeps the pairing popup open as an exact-origin relay. The Production page now uses `postMessage`; only the loopback page fetches the worker through its own origin.
- The random token remains only in the relay window's memory and is never returned to the Production page or browser storage.
- The worker stays loopback-only and continues to run Codex without `OPENAI_API_KEY`.

## Files and surfaces changed

- Browser relay client and cancellation handling in `src/lib/codexBridge.ts`.
- Loopback pairing page, same-origin worker access, and relay request handling in `scripts/codex-bridge/server.ts`.
- EN/TH connection and privacy copy.
- Unit/UI regressions, local development command, README, runbook, privacy model, demo script, and ADR-0009.

## Verification

- Unit relay tests passed.
- UI relay test proved the Production page makes no direct loopback `fetch` and closes the relay on disconnect.
- TypeScript and zero-warning ESLint checks passed before the full gate.
- Real local browser smoke passed: the relay connected as `gpt-5.6-sol`, processed a synthetic first answer with no API key, returned eight dimension assessments, updated server-owned confidence, and produced the adaptive next question.
- Static gate passed: formatting, zero-warning type-aware ESLint, TypeScript, Knip, CSS audit, and authentication residue scan.
- Backend/unit coverage: 110 tests passed; 93.52% lines and 82.81% branches.
- UI: 22 tests passed. Auth/RLS integration: 12 tests passed.
- Desktop/mobile Playwright: 8 tests passed with console/request auditing. The first mobile Notion run exposed a status-load race in the test setup; the E2E now waits for the loaded connection state before disconnecting, and the complete suite passed on rerun.
- Production build and bundle ceiling passed. Full and Production dependency audits found zero vulnerabilities.
- PR #36 was rebased onto `main` after every required check passed. The exact main SHA passed Required CI and the forward-only Production migration gate.
- Production `/api/health` reported the exact deployed SHA and `/api/ready` returned `200`; both deployment-evidence runs passed. The release switch was then returned to `false`.
- The authenticated Production browser paired through the new popup relay as `gpt-5.6-sol`. Neither the Production page nor the relay popup emitted a console warning or error, and the original direct-loopback `ERR_BLOCKED_BY_CLIENT` did not recur.
- Five adaptive synthetic turns reached 92% server-calculated confidence with all required dimensions ready, one surfaced assumption, and no contradiction. Codex then returned all sixteen structured brief sections.
- A structured edit was saved before approval. Approval created a read-only immutable version; Notion controls remained unavailable until that state was reached.
- Real Notion sync completed twice. A read-only exact-marker search returned one page, and the page contained all sixteen expected section headings, proving duplicate prevention and complete content handoff.
- The Production smoke used no OpenAI Platform API key and recorded no model input or output.

## Privacy exclusions

No prompt, answer, generated content, token, OAuth state, user identifier, or provider payload is recorded in this entry.
