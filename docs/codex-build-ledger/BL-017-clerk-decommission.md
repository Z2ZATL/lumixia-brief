# BL-017 — Legacy authentication decommission

- Status: in progress — runtime decommission is proven; external provider cleanup and Supabase-auth-only release remain
- Date started: 2026-07-18
- Codex Session: `019f614d-cd80-76d3-8151-b8271f575a3f`
- Codex model identifier: not exposed to the repository or terminal; intentionally not guessed
- Application live-model target: `gpt-5.6` (disabled throughout this milestone)
- Branch: `agent/clerk-decommission`
- Preparation commit: `56db2ca`
- Draft PR: [#31](https://github.com/Z2ZATL/lumixia-brief/pull/31)
- Hosted residue implementation commit: `8dc5e7b`
- External-decommission evidence commit: `5696dd5`
- Current CI: [Required CI passed](https://github.com/Z2ZATL/lumixia-brief/actions/runs/29638444036)

## Sanitized owner instruction

After verifying a second native TOTP factor, complete every non-model task. The owner subsequently authorized early destructive decommissioning before the originally planned soak boundary. Delete only legacy Clerk resources, preserve the Supabase Auth, application, Vercel, and email/DNS surfaces, and leave only the paid live GPT-5.6 contract smoke test after decommissioning is proven complete.

## Completed preparation evidence

- The owner verified a second native Supabase TOTP factor. The Production Security screen showed two verified factors named Primary and Backup, protected removal controls, and no browser warning or error. No QR secret, one-time code, token, email, or user identifier was recorded.
- Production remains on the known-good native-auth deployment created on 2026-07-18 at 03:03:11 Asia/Bangkok. The conservative decommission boundary remains 2026-07-19 at 03:04:08 Asia/Bangkok, allowing more than 24 hours after deployment and alias activation.
- The live landing contract and database readiness endpoint returned `200`; health reported version `0.1.0` and the unchanged safe deployment SHA `ba51d4984ab0ace711b9371513d4500d159ff152`.
- Vercel no longer contains the obsolete `OPENAI_API_KEY`, generic `PROVIDER_MODE`, `LOCAL_AUTH_BYPASS`, or the stale branch-specific Notion callback value in Preview or Production. No environment value was read or copied into evidence.
- A filtered Vercel audit confirmed that the four provider-mode matches are only the intended `MODEL_PROVIDER_MODE` and `NOTION_PROVIDER_MODE` entries for Preview and Production.
- The first environment inventory retained the encrypted Clerk rollback variables and duplicate legacy Supabase server variables while the running snapshot was preserved. A subsequent hosted-bundle audit proved that a legacy public build variable was still compiled into new Vite assets, so all remaining legacy Clerk and duplicate Supabase variables were removed from Preview and Production without reading their values. Existing deployments retain their immutable build/runtime snapshot, and the external provider trust remains available during the soak.
- `PRODUCTION_RELEASE_ENABLED` remains `false`. GitHub Required CI passed at merged `main` SHA `ea17c786921deb9d9ac7a373584072ebc38319b8`; the Production migration gate remains intentionally waiting and no deployment was promoted.
- Removing environment variables affects only future deployments. No redeploy was triggered, so the running rollback-tested snapshot remains unchanged throughout the soak.
- Both Supabase Clerk Third-Party Auth integrations were removed from staging and Production. A live Production reload after removal retained a valid native Supabase AAL2 session, two verified TOTP factors, project-list access, and the existing Notion connection.
- Production Security, Projects, and Connections produced no browser console log entries after the trust removal. The public landing, health, and readiness endpoints returned `200`; signed-out capabilities and projects endpoints returned `401` as designed.
- The Clerk dashboard does not permit self-service deletion while the application has an active Production instance. A sanitized support request was submitted to delete only the Lumixia Brief application and both of its instances while preserving the workspace and unrelated applications. The external application deletion remains pending Clerk support and no support identifiers or account data are recorded here.

## External decommission inventory

The following inventory and changes were captured without reading or recording secrets:

- The Supabase organization remains on the Free Plan. The legacy Clerk Third-Party Auth provider was removed from both Lumixia Brief Production and Staging, and its removal was verified in each dashboard.
- The Clerk dashboard contains exactly one Lumixia Brief application with Development and Production instances. Self-service deletion is blocked by Clerk for active Production applications, so deletion has been escalated to Clerk support and is not yet claimed complete.
- After owner passkey reauthentication, the Google Cloud inventory showed four OAuth clients. Redirect inspection proved that the client created on July 15 was the legacy Clerk client and did not use a Supabase callback. That client was deleted. A fresh three-client inventory proved that the Supabase Production client, Supabase Non-Production client, and an unrelated earlier Lumixia client remained.
- The Cloudflare DNS inventory identified two Clerk frontend/delegation records and three Clerk-branded mail/DKIM records. The frontend/delegation records were deleted and a fresh seven-record table proved them absent. Production and Preview application records, the root MX record, and all three mail/DKIM records were preserved exactly as required by the email-safety boundary.
- Public DNS resolution then proved both deleted frontend names absent while the Production and Preview application names still resolved. Landing, health, and readiness remained `200`; a fresh native AAL2 Security reload and Notion connection check produced zero browser log entries.
- These provider checks identify deletion cardinality but intentionally omit organization, project, application, instance, credential, account, and user identifiers from repository evidence.

## Hosted bundle residue regression

- A direct Production and Preview asset audit found no Clerk CSP domain and no credential-bearing CORS header, but it detected a legacy Clerk environment name embedded in the JavaScript entry bundle.
- Source and dependency residue gates had passed because the application no longer imports or reads that setting. Vite still received the unused public variable from Vercel and compiled the environment object into the entry asset.
- The remaining Clerk and duplicate legacy Supabase variables were removed from both Vercel environments. No environment value was printed, copied, or committed, and neither the running Production deployment nor its rollback snapshot was redeployed.
- `bundle:check` now rejects legacy Clerk runtime keys, packages, middleware, provider domains, local-auth bypass values, and browser test headers in built HTML or JavaScript assets.
- Four regression cases prove that a Supabase-auth-only bundle passes while a legacy Clerk key, Clerk provider domain, or local-auth bypass fails closed.
- A fresh Preview deployment for commit `8dc5e7b` passed Vercel and Required CI. `hosted:check` inspected four deployed JavaScript assets and found no legacy authentication residue.
- Deployment evidence now runs the same hosted residue policy against the deployed URL. The reusable policy rejects legacy packages, environment keys, provider domains, browser bypass headers, credential-bearing CORS, and source-map exposure.
- The regression suite now contains 101 unit/API tests and 19 UI tests. Backend coverage is 95.13% lines and 84.31% branches; formatting, lint, typecheck, Knip, CSS, source residue, build, bundle, audits, migrations/RLS, Playwright, container/SBOM, and secret scan gates passed.

## Remaining decommission and release sequence

The owner authorized proceeding before the original soak boundary. The remaining steps preserve the same least-destructive scope:

1. Track the Clerk support deletion request to completion. Do not delete the Clerk workspace or unrelated applications.
2. Merge the Supabase-auth-only residue gate, deploy from exact `main`, and repeat health/readiness, signed-out denial, AAL2, project ownership, Notion, hosted assets, sanitized logs, and browser-console checks.
3. Replace the rollback target with the verified Supabase-auth-only deployment and close this ledger with commit, PR, CI, and post-deletion evidence.

## Acceptance checklist

- [x] Native Supabase Google OAuth is active in Production.
- [x] Primary and Backup TOTP factors are verified.
- [x] Production health and readiness are green on the unchanged safe deployment.
- [x] Obsolete non-rollback Vercel variables are removed without redeploying.
- [x] All legacy Vercel variables are removed while the known-good deployment snapshot and external provider trust remain available for rollback.
- [x] Production release and migration promotion remain disabled.
- [x] Built-asset authentication residue is covered by a fail-closed regression gate.
- [ ] Conservative 24-hour soak has completed (owner explicitly authorized early decommissioning; retained only as historical evidence).
- [x] Native-auth and Notion smoke passed after Supabase Clerk trust removal.
- [x] Clerk Vercel variables and duplicate legacy Supabase variables are removed.
- [x] Supabase Clerk third-party Auth trust is removed from staging and Production.
- [x] Clerk-only Google OAuth credentials are deleted without changing Supabase or unrelated clients.
- [ ] Lumixia Brief Clerk application deletion is confirmed by Clerk support.
- [x] Clerk frontend/delegation Cloudflare records are removed without touching mail or application DNS.
- [ ] Supabase-auth-only redeploy and post-deletion clean gate have passed.
- [ ] Live GPT-5.6 Responses API contract smoke has passed with synthetic data.

## Explicit remaining boundary

No live OpenAI request was made. `MODEL_PROVIDER_MODE=disabled` remains intentional. After this legacy-provider milestone is completed, the only backend provider gate expected to remain is the paid live GPT-5.6 Responses API contract smoke test with synthetic data.
