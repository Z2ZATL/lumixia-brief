# BL-009 — Open-source publication and release handoff

- Date: 2026-07-15
- Codex Session: `019f614d-cd80-76d3-8151-b8271f575a3f`
- Public main commit: `09b4696a96c8d9f0c323dd8b040fb2740689e115`
- PRs: [#13 license](https://github.com/Z2ZATL/lumixia-brief/pull/13), [#11 hardening](https://github.com/Z2ZATL/lumixia-brief/pull/11), [#12 refactor](https://github.com/Z2ZATL/lumixia-brief/pull/12)
- CI: [license final](https://github.com/Z2ZATL/lumixia-brief/actions/runs/29366866368), [hardening final](https://github.com/Z2ZATL/lumixia-brief/actions/runs/29367175871)

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
- PR #13 and PR #11 passed every required CI gate before merge.
- GitHub reports the repository as public and recognizes `Apache-2.0`; `main` requires up-to-date Required CI, resolved conversations, linear history, and blocks force pushes and deletion.
- PR #12 final CI, merged SHA, and live integration smoke tests will be recorded as the milestone continues.

## Handoffs or blockers

- External provider credentials require authenticated owner sessions and must not be committed or pasted into public artifacts.
- Live Google/TOTP, OpenAI, Supabase, Notion, and Vercel checks remain pending until PR #12 is merged.
