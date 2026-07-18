# Build Week submission checklist

## Product and evidence

- [x] Work & Productivity claim and founder-for-Codex demo story
- [x] Landing, projects, adaptive interview, 8D confidence, structured brief, reject/revise, approval, Notion handoff
- [x] README, architecture, privacy, limitations, troubleshooting, Codex/GPT-5.6 use
- [x] Core `/feedback` Session ID recorded
- [x] Build Ledger and ADR structure
- [ ] Live GPT-5.6 contract smoke test with synthetic data
- [x] Disabled-model behavior, fake Responses-client contract, retry, refusal, schema, and no-network regression tests
- [x] Local Codex `gpt-5.6-sol` interview and brief schema smokes with no OpenAI API key
- [x] Full local website → Codex → five adaptive turns → 92% readiness → brief → approval → idempotent mock-Notion rehearsal
- [ ] Production website → local Codex → question → brief → approval → Notion recording rehearsal
- [x] Real Google/TOTP + backup-factor smoke test
- [x] Real Notion OAuth/refresh/idempotent-sync smoke test
- [x] Seeded founder example in production
- [ ] Demo path timed below 3:00

## Infrastructure

- [x] Supabase staging and production Auth configured Google-only + mandatory native TOTP
- [x] Supabase staging and production projects migrated; owner/AAL2 and cross-owner RLS verified
- [x] Notion public integration and redirect URIs configured
- [x] Vercel project linked; preview and production variables separated
- [x] Vercel Deployment Checks require GitHub **Required CI** and **Production migration gate**
- [x] Sentry project configured with Replay off and scrubbers verified
- [x] UptimeRobot checks `/`, `/api/health`, `/api/ready` every five minutes
- [x] Production rollback rehearsal recorded
- [x] Release gate enabled only for the approved exact SHA, then returned to `PRODUCTION_RELEASE_ENABLED=false`

## Repository and permissions

- [x] Public repository `Z2ZATL/lumixia-brief` available to judges without an invitation
- [x] Apache-2.0 `LICENSE` and project `NOTICE` recognized by GitHub
- [x] Full-history secret scan passed before changing repository visibility
- [x] `main` protection: PR, up-to-date required CI, resolved conversations, linear history, no force push, no required reviewer
- [x] CI green on the current Production SHA and evidence artifacts checked

## Submission

- [ ] Public YouTube video under three minutes with voiceover
- [ ] Video names Codex implementation and GPT-5.6 runtime roles
- [ ] Video explicitly distinguishes Codex-plan demo processing from the disabled paid API provider
- [ ] Devpost category: Work & Productivity
- [ ] Project description, production Vercel URL, public repo URL, and `/feedback` Session ID entered
- [ ] Final submission dry run from a signed-out browser
- [ ] Submit before internal target: 2026-07-21 23:00 Asia/Bangkok

External credential entry, OTPs, OAuth-console creation, and video publication require authenticated owner sessions and must not be guessed or bypassed.
