# ADR-0006: Native Supabase Auth and AAL2 authorization

- Status: accepted
- Date: 2026-07-16
- Build Ledger: BL-016

## Context

The prior identity layer issued a third-party JWT that the API forwarded to Supabase. It duplicated authentication configuration, made MFA behavior plan-dependent, and introduced another runtime and DNS boundary.

## Decision

Use Supabase Auth directly for Google-only OAuth and native TOTP. The browser completes a PKCE flow and sends the Supabase access token as a bearer token. Express verifies signature, issuer, expiry, UUID subject, authenticated role, and `aal2`; forced RLS repeats owner and `aal2` checks. Local demo identity is fixed inside the server and is rejected outside local mode.

Users must verify one TOTP factor before product access and can enroll one backup TOTP factor on another device. The application does not implement custom recovery codes. Notion redirects to a frontend bridge that removes OAuth values from the URL and completes the exchange through the protected API.

## Consequences

- One JWT now carries identity consistently through browser, API, rate limiter, store, and RLS.
- Production requires exact Google and application redirect allowlists plus asymmetric signing keys.
- A lost primary and backup factor requires an operator-assisted Auth account reset.
- The previous provider remains available only through an existing deployment during the 24-hour rollback window, then its application, variables, trust configuration, credentials, and dedicated DNS records are removed.
