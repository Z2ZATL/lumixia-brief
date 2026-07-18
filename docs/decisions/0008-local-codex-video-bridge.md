# ADR-0008: Loopback Codex bridge for the Build Week video

- Status: accepted
- Date: 2026-07-18
- Build Ledger: BL-019

## Context

The production Responses provider remains deliberately disabled until an OpenAI Platform key and paid smoke are authorized. The Build Week video must nevertheless demonstrate the intended website interaction: a user answers one question in Lumixia, Codex analyzes that answer, and the next question appears in the website.

The existing MCP integration runs the interview inside Codex. Codex CLI also supports non-interactive execution through the owner's ChatGPT/Codex sign-in, but that local credential must never be deployed to Vercel or exposed to public users.

## Decision

Add an owner-operated HTTP bridge bound only to `127.0.0.1`. The browser pairs through an origin-bound popup and keeps the random token only for the current browser session. Interview and brief requests travel directly from the Lumixia browser to the local worker. The worker invokes the pinned Codex CLI ephemerally in an empty temporary directory with user config and MCP disabled, a read-only sandbox, no approvals, bounded execution, and strict JSON Schema output.

The browser submits the structured result to new AAL2-protected Lumixia endpoints. Existing server validation, evidence rules, confidence calculation, stop rules, idempotency, versioning, human approval, and Notion boundaries remain authoritative. The worker receives no Supabase credential and cannot approve, delete, or sync.

Production retains `MODEL_PROVIDER_MODE=disabled`; `CODEX_LOCAL_BRIDGE_MODE=enabled` only enables the validated handoff endpoints. This preserves the rule that production model mocks are forbidden and avoids presenting the local worker as a hosted provider.

## Consequences

- The video can demonstrate the complete website interview and structured brief without an OpenAI API key or API charge.
- The actual model identifier is recorded from the successful synthetic smoke, while prompts, answers, tokens, and model output remain excluded from evidence.
- The owner's machine, Codex login, Chrome local-network permission, and worker must remain available during recording.
- The feature is not suitable for judges or public users running independently; live Responses API remains the production path after billing is authorized.
- The Notion handoff is unchanged and still requires direct Google + TOTP browser approval.
