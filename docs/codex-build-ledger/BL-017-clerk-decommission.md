# BL-017 — Legacy authentication decommission

- Status: in progress — conservative production soak is active
- Date started: 2026-07-18
- Codex Session: `019f614d-cd80-76d3-8151-b8271f575a3f`
- Codex model identifier: not exposed to the repository or terminal; intentionally not guessed
- Application live-model target: `gpt-5.6` (disabled throughout this milestone)
- Branch: `agent/clerk-decommission`
- Preparation commit: `56db2ca`
- Draft PR: [#31](https://github.com/Z2ZATL/lumixia-brief/pull/31)
- CI: pending

## Sanitized owner instruction

After verifying a second native TOTP factor, continue every safe non-model completion task, preserve the rollback boundary during the production soak, and leave only the paid live GPT-5.6 contract smoke test after decommissioning is proven complete.

## Completed preparation evidence

- The owner verified a second native Supabase TOTP factor. The Production Security screen showed two verified factors named Primary and Backup, protected removal controls, and no browser warning or error. No QR secret, one-time code, token, email, or user identifier was recorded.
- Production remains on the known-good native-auth deployment created on 2026-07-18 at 03:03:11 Asia/Bangkok. The conservative decommission boundary remains 2026-07-19 at 03:04:08 Asia/Bangkok, allowing more than 24 hours after deployment and alias activation.
- The live landing contract and database readiness endpoint returned `200`; health reported version `0.1.0` and the unchanged safe deployment SHA `ba51d4984ab0ace711b9371513d4500d159ff152`.
- Vercel no longer contains the obsolete `OPENAI_API_KEY`, generic `PROVIDER_MODE`, `LOCAL_AUTH_BYPASS`, or the stale branch-specific Notion callback value in Preview or Production. No environment value was read or copied into evidence.
- A filtered Vercel audit confirmed that the four provider-mode matches are only the intended `MODEL_PROVIDER_MODE` and `NOTION_PROVIDER_MODE` entries for Preview and Production.
- The first environment inventory retained the encrypted Clerk rollback variables and duplicate legacy Supabase server variables while the running snapshot was preserved. A subsequent hosted-bundle audit proved that a legacy public build variable was still compiled into new Vite assets, so all remaining legacy Clerk and duplicate Supabase variables were removed from Preview and Production without reading their values. Existing deployments retain their immutable build/runtime snapshot, and the external provider trust remains available during the soak.
- `PRODUCTION_RELEASE_ENABLED` remains `false`. GitHub Required CI passed at merged `main` SHA `ea17c786921deb9d9ac7a373584072ebc38319b8`; the Production migration gate remains intentionally waiting and no deployment was promoted.
- Removing environment variables affects only future deployments. No redeploy was triggered, so the running rollback-tested snapshot remains unchanged throughout the soak.

## Read-only external decommission inventory

The following inventory was captured during the soak without reading secrets or changing provider state:

- The Supabase organization remains on the Free Plan. Lumixia Brief Production and Staging are active, and each project has exactly one Clerk Third-Party Auth provider with one removal control. No provider was removed.
- The Clerk dashboard contains exactly one Lumixia Brief application. Both its Development and Production instances are present. No application or instance setting was changed.
- The Google Cloud project session is signed in, but the credentials area requires owner identity or passkey reauthentication before the legacy OAuth clients can be distinguished and deleted safely. No credential was opened, disabled, or deleted.
- The Cloudflare session is signed out. DNS inventory and deletion are therefore deferred until the owner signs in after the soak. No DNS record was read or changed.
- These provider checks identify deletion cardinality but intentionally omit organization, project, application, instance, credential, account, and user identifiers from repository evidence.

## Hosted bundle residue regression

- A direct Production and Preview asset audit found no Clerk CSP domain and no credential-bearing CORS header, but it detected a legacy Clerk environment name embedded in the JavaScript entry bundle.
- Source and dependency residue gates had passed because the application no longer imports or reads that setting. Vite still received the unused public variable from Vercel and compiled the environment object into the entry asset.
- The remaining Clerk and duplicate legacy Supabase variables were removed from both Vercel environments. No environment value was printed, copied, or committed, and neither the running Production deployment nor its rollback snapshot was redeployed.
- `bundle:check` now rejects legacy Clerk runtime keys, packages, middleware, provider domains, local-auth bypass values, and browser test headers in built HTML or JavaScript assets.
- Four regression cases prove that a Supabase-auth-only bundle passes while a legacy Clerk key, Clerk provider domain, or local-auth bypass fails closed.
- A fresh Preview deployment and hosted-asset audit are required before closing this finding.

## Post-soak decommission sequence

The following actions are intentionally deferred until the conservative soak boundary has passed and health, AAL2, project ownership, Notion, Sentry, and uptime evidence remain green:

1. Recheck Production health/readiness, deployed SHA, native Google sign-in, both TOTP factors, AAL2 project access, sign-out, Notion connection, and browser console.
2. Confirm that Vercel Preview and Production still contain no legacy Clerk or duplicate Supabase variables.
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
- [x] All legacy Vercel variables are removed while the known-good deployment snapshot and external provider trust remain available for rollback.
- [x] Production release and migration promotion remain disabled.
- [x] Built-asset authentication residue is covered by a fail-closed regression gate.
- [ ] Conservative 24-hour soak has completed.
- [ ] Post-soak native-auth and Notion smoke has passed.
- [x] Clerk Vercel variables and duplicate legacy Supabase variables are removed.
- [ ] Supabase Clerk third-party Auth trust is removed from staging and Production.
- [ ] Clerk-only Google OAuth credentials are deleted.
- [ ] Lumixia Brief Clerk applications are deleted.
- [ ] Clerk-only Cloudflare records are removed without touching mail or application DNS.
- [ ] Supabase-auth-only redeploy and post-deletion clean gate have passed.
- [ ] Live GPT-5.6 Responses API contract smoke has passed with synthetic data.

## Explicit remaining boundary

No live OpenAI request was made. `MODEL_PROVIDER_MODE=disabled` remains intentional. After this legacy-provider milestone is completed, the only backend provider gate expected to remain is the paid live GPT-5.6 Responses API contract smoke test with synthetic data.
