# ADR-0004: Versioned approval before idempotent Notion handoff

- Status: accepted
- Date: 2026-07-14

## Context

Users need to edit AI output, but downstream systems need an unambiguous approved artifact. Retries must not create duplicate Notion pages.

## Decision

Brief content is stored in fixed sections and numbered versions. Approval records user and timestamp and makes the snapshot immutable. Editing it creates a new draft. Notion sync is allowed only for the latest approved version and is uniquely keyed by project/version. The page ID is persisted and reused for retry. OAuth tokens are encrypted with AES-256-GCM and refreshed once on expiry/401.

## Consequences

- Diffing, confidence mapping, and evidence remain reliable.
- MVP creates a child page beneath a selected parent and does not map arbitrary database properties.
- An uncertain network failure before Notion returns a new page ID remains an external API limitation; operational review uses the sync record and page title/version.
