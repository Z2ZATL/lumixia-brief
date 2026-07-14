# Build Week submission checklist

## Product and evidence

- [x] Work & Productivity claim and founder-for-Codex demo story
- [x] Landing, projects, adaptive interview, 8D confidence, structured brief, reject/revise, approval, Notion handoff
- [x] README, architecture, privacy, limitations, troubleshooting, Codex/GPT-5.6 use
- [x] Core `/feedback` Session ID recorded
- [x] Build Ledger and ADR structure
- [ ] Live GPT-5.6 contract smoke test with synthetic data
- [ ] Real Google/TOTP + backup-code smoke test
- [ ] Real Notion OAuth/refresh/idempotent-sync smoke test
- [ ] Seeded founder example in production
- [ ] Demo path timed below 3:00

## Infrastructure

- [ ] Clerk development and production instances configured Google-only + mandatory TOTP
- [ ] Supabase staging and production projects migrated; RLS verified with two users
- [ ] Notion public integration and redirect URIs configured
- [ ] Vercel project linked; preview and production variables separated
- [ ] Vercel Deployment Check requires GitHub **Required CI**
- [ ] Sentry projects configured with Replay off and scrubbers verified
- [ ] UptimeRobot checks `/`, `/api/health`, `/api/ready` every five minutes
- [ ] Production rollback rehearsal recorded
- [ ] `PRODUCTION_RELEASE_ENABLED=true` only after the above

## Repository and permissions

- [x] Public repository `Z2ZATL/lumixia-brief` available to judges without an invitation
- [x] Apache-2.0 `LICENSE` and project `NOTICE` recognized by GitHub
- [x] Full-history secret scan passed before changing repository visibility
- [x] `main` protection: PR, up-to-date required CI, resolved conversations, linear history, no force push, no required reviewer
- [ ] CI green on the final SHA and evidence artifacts downloaded/checked

## Submission

- [ ] Public YouTube video under three minutes with voiceover
- [ ] Video names Codex implementation and GPT-5.6 runtime roles
- [ ] Devpost category: Work & Productivity
- [ ] Project description, production Vercel URL, public repo URL, and `/feedback` Session ID entered
- [ ] Final submission dry run from a signed-out browser
- [ ] Submit before internal target: 2026-07-21 23:00 Asia/Bangkok

External credential entry, OTPs, OAuth-console creation, and video publication require authenticated owner sessions and must not be guessed or bypassed.
