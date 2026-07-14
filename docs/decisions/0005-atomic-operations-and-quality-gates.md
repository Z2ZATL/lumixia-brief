# ADR 0005: Atomic provider operations and actionable-clean gates

- Status: Accepted
- Date: 2026-07-15
- Build Ledger: BL-007

## Context

Interview analysis and Notion synchronization cross a database and an external provider. Browser retries, provider timeouts, repeated clicks, and concurrent requests can otherwise create duplicate turns, approve unsaved content, or create duplicate Notion pages. Static checks also did not previously reject dead code or unsafe asynchronous TypeScript.

## Decision

- Store interview and Notion operation claims with stable operation IDs, content payload/hash, status, result/error, and expiring leases.
- Use database RPCs for claim/complete and compare-and-save boundaries; only a stale lease may be reclaimed.
- Return the previous result for an identical completed operation, `202` for the identical in-flight operation, and `409` for conflicting concurrent content.
- Keep approved brief snapshots immutable and require a successful draft save before approval.
- Require strict TypeScript, type-aware ESLint, Knip, UI regression tests, console-clean E2E, production audit, Docker build, Trivy scan, and bundle limits in CI.
- Separate development CLI advisories from production runtime findings in a visible record.

## Consequences

Retries recover deterministically without duplicating turns or Notion pages. More state is persisted and migrations/RPCs must remain forward-compatible. Development tooling can retain a documented advisory only when production is clean and no compatible non-breaking remediation exists.
