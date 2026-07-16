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
5. Notion receives only an approved version after explicit sync.
6. Monitoring receives operational metadata only.

## Required Supabase Auth configuration

- Enable Google as the only sign-in strategy.
- Require native TOTP enrollment and recommend a second verified TOTP factor on another device.
- Use asymmetric ES256 signing keys and the publishable API-key system.
- Express verifies the JWT signature, issuer, expiry, UUID `sub`, `role=authenticated`, and `aal=aal2` before business logic.
- Forced RLS independently requires `sub = owner_id` and `aal=aal2`.
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
