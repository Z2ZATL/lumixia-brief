# BL-015 â€” Live integrations and release evidence

- Date: 2026-07-15
- Codex Session: `019f614d-cd80-76d3-8151-b8271f575a3f`
- Codex model identifier: not exposed to the repository or terminal; intentionally not guessed
- Application live-model target: `gpt-5.6`
- Commit: pending
- PR: [#23](https://github.com/Z2ZATL/lumixia-brief/pull/23)
- CI: pending

## Sanitized owner instruction

Configure and verify the non-OpenAI live integration path, preserve the security boundaries, and keep an auditable record that excludes prompts, answers, briefs, secrets, tokens, personal identifiers, production payloads, and chain-of-thought.

## Decisions and behavior

- Kept the Preview model provider on deterministic mock mode and the Production model provider disabled. No OpenAI client key or paid model request is required for this milestone.
- Configured separate Clerk development and production credentials for their matching Vercel environments.
- Configured separate Supabase staging and production endpoints with publishable credentials only; no service-role credential is present in the application runtime.
- Configured OAuth-state signing and token-encryption keys as sensitive Vercel variables for Preview and Production.
- Registered exact local, Preview, and Production Notion OAuth callback URLs.
- Rotated the Notion OAuth client secret after owner confirmation, stored the current value as a sensitive Vercel variable in Preview and Production, and invalidated the previous value.
- Preserved Vercel Git deployments as the only deployment path. Production migration and release promotion remain disabled until the live Preview acceptance gates pass.

## Surfaces changed

- Notion developer connection configuration
- Vercel Preview and Production encrypted environment configuration
- Clerk development and production application configuration
- Supabase staging and production project configuration
- Build Ledger evidence only; no application behavior changed in this checkpoint

## Regression defect found during this milestone

- The OAuth-state tamper regression changed the final Base64URL character. A different final character can decode to the same bytes when it changes only unused padding bits, so Linux CI intermittently accepted the supposedly tampered signature. The test now changes the first encoded signature character, which always changes decoded signature bits while preserving a syntactically valid state.

## Verification completed

- Notion developer portal confirmed the connection update and all three exact redirect URLs.
- Vercel accepted the rotated Notion client secret as a sensitive variable for Preview and Production.
- The captured secret matched the expected provider format before storage; its value was not printed to a repository file, terminal log, or evidence artifact.
- The transient browser clipboard value was cleared after storage.
- The focused Notion provider suite passed 10 consecutive runs after the deterministic tamper fix.
- ESLint with zero warnings, strict TypeScript, the complete 84-test unit/API/provider suite, formatting, and diff checks passed locally.
- OpenAI network requests: zero.

## Remaining milestone gates

- Redeploy the current Preview commit with the completed environment configuration.
- Verify Preview health/readiness and deployment SHA.
- Verify signed-out denial, Google sign-in, AAL1 denial, TOTP/AAL2 access, owner project CRUD, and cross-user RLS denial.
- Verify live Notion OAuth, token refresh behavior, page selection, first sync, duplicate retry, revision sync, and disconnect/reconnect safety.
- Verify sanitized Sentry delivery, uptime monitors, Production migration gate, Production deployment, and rollback rehearsal.
- Keep the paid live GPT-5.6 Responses API contract smoke test deferred.
