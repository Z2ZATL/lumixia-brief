# ADR-0009: Keep the loopback popup as the Codex relay

- Status: accepted
- Date: 2026-07-18
- Build Ledger: BL-020
- Supersedes: ADR-0008 direct browser-to-worker transport only

## Context

The first Production rehearsal paired successfully, but Chrome blocked the HTTPS Lumixia page's direct request to `http://127.0.0.1:8790/health` with `ERR_BLOCKED_BY_CLIENT`. The owner had already enabled the site's local-network permission, and the worker was listening and returned the expected CORS response when tested outside the page. A top-level loopback pairing page remained reachable.

The bridge must remain loopback-only, use the owner's existing Codex login, expose no public tunnel, place no credential in a URL or log, and keep approval and Notion sync in the AAL2 web session.

## Decision

Keep the origin-bound pairing popup open as a same-origin loopback relay. The Production page sends bounded requests with random operation IDs through exact-origin, exact-window `postMessage`. The relay performs the same-origin `/health`, `/v1/interview`, and `/v1/brief` fetches and returns only the response envelope.

The pairing token stays in the relay window's JavaScript closure. It is never returned to the Production page, stored in browser storage, placed in a URL, or logged. The relay validates the opener origin and source for every request, supports cancellation, and holds one request controller per operation. Disconnect or sign-out closes the window and rejects pending work.

## Consequences

- The Production page no longer makes a mixed-scheme request to loopback, eliminating the observed browser block.
- The relay window must remain open during the interview and brief generation.
- Popup permission is required when connecting; local-network permission is no longer part of the application transport contract.
- Codex still receives no Supabase token and cannot approve, delete, or sync to Notion.
- The worker remains bound only to `127.0.0.1:8790`; this is still an owner-operated video path, not a hosted public provider.
