# Codex working agreement

This repository is an OpenAI Build Week submission. Preserve these invariants:

1. Never log or commit prompts, interview answers, briefs, tokens, emails, user identifiers, secrets, or chain-of-thought.
2. Every material milestone must add or update a `BL-###` entry in `CODEX_BUILD_LOG.md` and, when useful, a detailed file under `docs/codex-build-ledger/`.
3. Commit messages must include `Codex-Session:` and `Build-Ledger:` trailers.
4. Approved brief content is immutable. Editing it creates a new draft version.
5. The server—not the model—calculates confidence and enforces stop rules.
6. Production must fail closed unless Clerk MFA, Supabase RLS, live OpenAI, token encryption, and live Notion OAuth are configured.
7. Database changes are forward-only expand-and-contract migrations through the submission deadline.
8. Update tests and user-facing documentation with behavior changes.

Before handoff, run `npm run format:check`, `npm run lint`, `npm run typecheck`, `npm run test`, `npm run build`, and `npm run audit:prod`.
