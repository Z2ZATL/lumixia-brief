# ADR-0003: MFA at both application and data boundaries

- Status: accepted
- Date: 2026-07-14

## Context

Project prompts and briefs may contain commercially sensitive information. A protected React route alone does not prevent direct API or database access.

## Decision

Clerk is configured for Google-only sign-in with TOTP and backup codes. Express rejects sessions without AAL2-equivalent claims. Supabase accepts the current Clerk JWT and forces row-level policies requiring both `sub = owner_id` and `aal2`, valid second-factor age, or MFA authentication method.

Provider payloads and content are excluded from logs and monitoring. OpenAI uses `store:false`. Production cannot run in bypass/mock/memory modes.

## Consequences

- Judges must enroll TOTP before accessing the product.
- Clerk dashboard and JWT template configuration are release-critical manual steps.
- Support diagnostics use request IDs and sanitized provider error classes, not content.
