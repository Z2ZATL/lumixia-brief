# BL-013 — Production Google OAuth recovery

- Date: 2026-07-15
- Codex Session: `019f614d-cd80-76d3-8151-b8271f575a3f`
- Commit: `e28bfe5`
- PR: [#22](https://github.com/Z2ZATL/lumixia-brief/pull/22)
- CI: [29408227500](https://github.com/Z2ZATL/lumixia-brief/actions/runs/29408227500)

## Sanitized owner instruction

Diagnose the Google authorization error shown during production sign-in, restore the live Google OAuth path, keep OpenAI usage deferred, and continue recording Codex work without exposing credentials or user data.

## Incident and decisions

- Reproduced Google's `400 invalid_request` response and confirmed that the authorization request contained an empty `client_id`.
- Confirmed that the Clerk production Google connection was enabled but still marked `Setup required` because custom credentials were missing.
- Reused the existing Google Cloud project but created a dedicated Web OAuth client for Lumixia Brief so the prior Lumixia client and its callback remain unchanged.
- Registered only the production application origin and the exact Clerk-generated callback URI.
- Stored the generated client identifier and secret directly in Clerk production. Neither value was added to Git, local environment files, terminal output, this ledger, or monitoring.
- Google no longer reveals an existing client secret after its one-time creation surface. A new rotatable secret was created for Clerk; the older inaccessible secret remains enabled until the authenticated callback is verified, after which it should be disabled and deleted with explicit owner approval.
- Clerk changed from `Setup required` to `Enabled — Users can authenticate with this provider`.

## Surfaces changed

- Google Cloud Auth Platform OAuth client configuration
- Clerk production Google social connection
- Production sign-in smoke test at `https://brief.z2zs.space`
- `README.md`
- `CODEX_BUILD_LOG.md`
- This ledger entry

## Verification

- A fresh signed-out browser followed the landing-page call to action to the Clerk sign-in surface.
- Selecting Google reached Google's real account chooser instead of `400 invalid_request`; this proves that a non-empty recognized client ID is now present.
- The exact registered callback matches the read-only callback shown by Clerk production.
- No OpenAI request was made and no paid API quota was used.
- Credential values, account emails, authorization codes, prompts, answers, and payloads are excluded from repository evidence.

## Remaining live handoffs

- The owner must select their Google account and complete any Google consent, Clerk TOTP enrollment, and backup-code steps.
- After the authenticated callback succeeds, disable and delete the superseded Google client secret to remove the temporary two-secret rotation window.
- Confirm whether the Google consent audience should remain limited to test users for the competition demo or be published for broader judge access.
- OpenAI live interview generation and Notion OAuth/page sync remain separate provider tests.
