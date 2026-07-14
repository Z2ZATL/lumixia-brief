# BL-009 — Open-source publication and release handoff

- Date: 2026-07-15
- Codex Session: `019f614d-cd80-76d3-8151-b8271f575a3f`
- Commit: pending
- PR: pending
- CI: pending

## Sanitized owner instruction

Publish Lumixia Brief as an open-source GitHub repository, add an appropriate license, merge the two completed hardening and refactor pull requests in order, and then configure credentials for live integration testing.

## Decisions and user-visible behavior

- Selected Apache License 2.0 for permissive commercial and personal reuse with explicit attribution, contribution, and patent terms.
- Added a top-level `LICENSE` and `NOTICE` before changing repository visibility so the public source is never exposed without licensing terms.
- Kept credential entry and live-provider payloads outside Git, logs, monitoring, and this ledger.

## Files/surfaces changed

- `LICENSE`
- `NOTICE`
- Open-source metadata and submission documentation after the final branch merge
- GitHub repository visibility and pull-request state

## Verification

- Full-history Gitleaks `v8.24.3` scan: 9 commits scanned, zero findings before publication.
- No tracked `.env` files; `.env.local` remains ignored.
- License text is the unmodified Apache License 2.0 text with the project copyright notice in its appendix.
- Final CI, public visibility, merged SHAs, and live integration smoke tests will be recorded as the milestone continues.

## Handoffs or blockers

- External provider credentials require authenticated owner sessions and must not be committed or pasted into public artifacts.
- Live Google/TOTP, OpenAI, Supabase, Notion, and Vercel checks remain pending until the repository and PR release sequence is complete.
