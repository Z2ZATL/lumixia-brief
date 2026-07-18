# Security and privacy model

## Protected assets

- vague project ideas, interview answers, generated briefs, and approval history;
- Google/Supabase session and second-factor state;
- OpenAI and Notion credentials;
- Notion parent/page identifiers; and
- deployment/database secrets.

## Trust boundaries

1. The browser can render project content but never receives provider or encryption secrets.
2. Express validates session, MFA, exact origin, rate, size, schema, and ownership before business logic.
3. Supabase repeats ownership and MFA enforcement with forced RLS; application authorization is not sufficient by itself.
4. OpenAI receives interview context only on explicit submit/generate in live mode and uses `store:false`; disabled mode creates no OpenAI client or network request.
5. Local demo mode sends minimized project context from the owner browser directly to `127.0.0.1`; Codex receives no Supabase token, owner ID, Notion identifier, or provider credential.
6. Notion receives only an approved version after explicit sync.
7. Monitoring receives operational metadata only.

## Local Codex bridge boundary

- The worker binds only to loopback and accepts exact allowlisted Lumixia origins.
- Pairing uses an in-memory random token delivered with origin-bound `postMessage`; it is never placed in a URL, terminal log, repository, database, or monitoring event.
- Browser storage is session-only and is cleared on sign-out.
- Codex runs ephemerally in an empty temporary directory, ignores user configuration and MCP servers, uses a read-only sandbox with approvals disabled, and must return strict JSON Schema output.
- The worker processes one operation at a time, caps input/output, suppresses successful CLI diagnostics, and returns only safe error codes.
- This is an owner-operated demo boundary, not a multi-user production inference service.

## Required Supabase Auth configuration

- Enable Google as the only sign-in strategy.
- Require native TOTP enrollment and recommend a second verified TOTP factor on another device.
- Use asymmetric ES256 signing keys and the publishable API-key system.
- Express verifies the JWT signature, issuer, expiry, UUID `sub`, and `role=authenticated`. Browser API access additionally requires a direct `aal2` token with no OAuth client identifier.
- Codex OAuth sessions retain their real `aal1` claim. MCP access requires `client_id`, `openid`, and a non-revoked 30-day grant created only by a direct AAL2 consent session.
- Forced RLS independently requires `sub = owner_id` plus either direct AAL2 or the matching Codex grant. OAuth writes are restricted to drafts/interviews; approval, deletion, and Notion access require direct AAL2.
- Set production redirect/origin allowlists exactly; do not use wildcards.

## Data and deletion

Data is retained until the owner deletes the project. Project deletion cascades idempotency claims and sync records. Notion connection deletion removes encrypted credentials. Backups and Supabase retention must be documented in the production project before launch.

## Monitoring redaction

Never send request/response bodies, prompts, answers, brief sections, tokens, authorization/cookie headers, emails, Notion/OpenAI payloads, or user identifiers. Sentry Session Replay stays disabled. Test fixtures use synthetic content.

## Release security gate

- zero critical image/security findings;
- production dependency audit clean;
- secret scan clean;
- AAL1, unauthenticated, and cross-owner access denied;
- encryption tamper test passes;
- real TOTP and expired Notion-token smoke test passes;
- `/api/health` and `/api/ready` green; and
- rollback rehearsal recorded.

Report vulnerabilities privately to the repository owner. Do not open a public issue containing exploit details or sensitive data.
