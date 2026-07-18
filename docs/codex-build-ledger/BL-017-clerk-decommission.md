# BL-017 — Legacy authentication decommission

- Status: in progress — conservative production soak is active
- Date started: 2026-07-18
- Codex Session: `019f614d-cd80-76d3-8151-b8271f575a3f`
- Codex model identifier: not exposed to the repository or terminal; intentionally not guessed
- Application live-model target: `gpt-5.6` (disabled throughout this milestone)
- Branch: `agent/clerk-decommission`
- Commit / PR / CI: pending

## Sanitized owner instruction

After verifying a second native TOTP factor, continue every safe non-model completion task, preserve the rollback boundary during the production soak, and leave only the paid live GPT-5.6 contract smoke test after decommissioning is proven complete.

## Completed preparation evidence

- The owner verified a second native Supabase TOTP factor. The Production Security screen showed two verified factors named Primary and Backup, protected removal controls, and no browser warning or error. No QR secret, one-time code, token, email, or user identifier was recorded.
- Production remains on the known-good native-auth deployment created on 2026-07-18 at 03:03:11 Asia/Bangkok. The conservative decommission boundary remains 2026-07-19 at 03:04:08 Asia/Bangkok, allowing more than 24 hours after deployment and alias activation.
- The live landing contract and database readiness endpoint returned `200`; health reported version `0.1.0` and the unchanged safe deployment SHA `ba51d4984ab0ace711b9371513d4500d159ff152`.
- Vercel no longer contains the obsolete `OPENAI_API_KEY`, generic `PROVIDER_MODE`, `LOCAL_AUTH_BYPASS`, or the stale branch-specific Notion callback value in Preview or Production. No environment value was read or copied into evidence.
- A filtered Vercel audit confirmed that the four provider-mode matches are only the intended `MODEL_PROVIDER_MODE` and `NOTION_PROVIDER_MODE` entries for Preview and Production.
- The encrypted Clerk rollback variables and duplicate legacy Supabase server variables remain in Preview and Production until the soak passes. Their values were neither revealed nor changed.
- `PRODUCTION_RELEASE_ENABLED` remains `false`. GitHub Required CI passed at merged `main` SHA `ea17c786921deb9d9ac7a373584072ebc38319b8`; the Production migration gate remains intentionally waiting and no deployment was promoted.
- Removing environment variables affects only future deployments. No redeploy was triggered, so the running rollback-tested snapshot remains unchanged throughout the soak.

## Post-soak decommission sequence

The following actions are intentionally deferred until the conservative soak boundary has passed and health, AAL2, project ownership, Notion, Sentry, and uptime evidence remain green:

1. Recheck Production health/readiness, deployed SHA, native Google sign-in, both TOTP factors, AAL2 project access, sign-out, Notion connection, and browser console.
2. Remove only the retained Clerk variables and duplicate legacy Supabase server variables from Vercel Preview and Production, then deploy through the normal gates.
3. Remove the Clerk third-party Auth integration from Supabase staging and Production.
4. Disable and delete only the Google OAuth clients created for the Clerk application after owner reauthentication confirms their identity.
5. Delete only the Lumixia Brief Clerk development and Production application. Do not delete the Clerk account or unrelated applications.
6. Remove only Clerk verification or delegation records from Cloudflare after an exact-name audit. Preserve `brief.z2zs.space`, `preview.brief.z2zs.space`, Vercel records, MX, SPF, DKIM, DMARC, and every mail-related record.
7. Redeploy, repeat the full signed-out/AAL1/AAL2/RLS/Notion/console smoke test, inspect sanitized logs, and confirm that source, bundle, runtime environment, Supabase trust, Google credentials, and DNS contain no active Clerk dependency.
8. Replace the rollback target with the verified Supabase-auth-only deployment and close this ledger with commit, PR, CI, and post-deletion evidence.

## Acceptance checklist

- [x] Native Supabase Google OAuth is active in Production.
- [x] Primary and Backup TOTP factors are verified.
- [x] Production health and readiness are green on the unchanged safe deployment.
- [x] Obsolete non-rollback Vercel variables are removed without redeploying.
- [x] Legacy rollback variables are retained during the soak.
- [x] Production release and migration promotion remain disabled.
- [ ] Conservative 24-hour soak has completed.
- [ ] Post-soak native-auth and Notion smoke has passed.
- [ ] Clerk Vercel variables and duplicate legacy Supabase variables are removed.
- [ ] Supabase Clerk third-party Auth trust is removed from staging and Production.
- [ ] Clerk-only Google OAuth credentials are deleted.
- [ ] Lumixia Brief Clerk applications are deleted.
- [ ] Clerk-only Cloudflare records are removed without touching mail or application DNS.
- [ ] Supabase-auth-only redeploy and post-deletion clean gate have passed.
- [ ] Live GPT-5.6 Responses API contract smoke has passed with synthetic data.

## Explicit remaining boundary

No live OpenAI request was made. `MODEL_PROVIDER_MODE=disabled` remains intentional. After this legacy-provider milestone is completed, the only backend provider gate expected to remain is the paid live GPT-5.6 Responses API contract smoke test with synthetic data.
