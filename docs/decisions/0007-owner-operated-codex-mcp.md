# ADR-0007: Owner-operated Codex MCP connection

- Status: accepted
- Date: 2026-07-18
- Build Ledger: BL-018

## Context

The live OpenAI Responses provider remains disabled until paid API credit is available. The owner already has access to Codex and asked whether Lumixia Brief could use that access without creating OpenAI API charges for the application.

Codex plan access is not an API credential and cannot be embedded in a Vercel function. Codex can, however, connect to a remote MCP server and invoke owner-approved tools interactively.

## Decision

Expose a stateless Streamable HTTP MCP endpoint at `/api/mcp`. Authenticate it with Supabase OAuth 2.1 and require the existing Google identity, a direct AAL2 consent decision, authenticated audience and role, UUID subject, explicit OAuth client identifier, owner RLS, and write approval in Codex.

Supabase OAuth Server creates a separate AAL1 session instead of carrying the browser session's AAL2 proof into the OAuth token. Do not forge or overwrite `aal`. Record a 30-day owner/client grant only from the direct AAL2 consent page, then require that grant in Express and RLS. OAuth tokens remain limited to draft/interview writes; database policy separately rejects approval, deletion, and Notion access even if the transport is bypassed.

Expose only project listing/context, idempotent project creation, structured interview-turn recording, and structured brief-draft saving. The server remains authoritative for evidence validation, confidence, readiness, stop rules, workflow transitions, and versioning. Do not expose approval, deletion, OAuth token management, or Notion sync through MCP.

The browser callback and consent page may complete authentication and authorization, but prompts, answers, briefs, tokens, factor codes, email addresses, and user identifiers must not enter logs or Build Ledger evidence.

## Consequences

- The owner can run the core interview with Codex without configuring `OPENAI_API_KEY` or incurring Lumixia OpenAI API charges.
- Use remains interactive and subject to the owner's Codex plan limits and approval settings.
- Production must enable Supabase OAuth Server, Dynamic Client Registration, the `/oauth/consent` authorization path, and asymmetric signing.
- The paid GPT-5.6 Responses smoke test remains a separate release gate; this connection does not claim to replace the application provider.
- Human review, immutable approval, and Notion sync retain the original trust boundary.
- The owner can revoke the database grant immediately; OAuth tokens become unusable against Lumixia RLS without waiting for token expiry.
