# Codex MCP operations runbook

## Purpose

Connect Codex desktop, CLI, or IDE to Lumixia Brief as the authenticated project owner. The connection uses the owner's Codex access and never reads `OPENAI_API_KEY`.

## Hosted configuration

1. In Supabase Auth, use an asymmetric signing key and enable OAuth Server.
2. Set the authorization path to `/oauth/consent`.
3. Enable Dynamic Client Registration so Codex can register its OAuth client.
4. Keep Google as the sign-in provider and TOTP as the mandatory AAL2 factor.
5. Deploy with `CODEX_MCP_MODE=enabled`, native Supabase Auth, Supabase data, and exact production origins.

Supabase OAuth access tokens retain the standard `authenticated` audience, but the OAuth Server creates a separate AAL1 session even when the consent UI was opened from an AAL2 browser session. Lumixia does not rewrite that claim. Before approval, the AAL2 consent UI records a 30-day grant for the exact owner and OAuth `client_id`. Express and RLS then require that grant together with `openid`, UUID subject, authenticated role, exact issuer, and an unexpired token.

## Pre-connection checks

The following checks must not expose tokens or user data:

1. `GET /.well-known/oauth-protected-resource/api/mcp` returns the protected-resource metadata.
2. An unauthenticated `POST /api/mcp` returns `401` with an OAuth `WWW-Authenticate` challenge.
3. `/api/health` and `/api/ready` are green on the intended deployment SHA.
4. `GET /api/capabilities` reports Codex available for an authenticated AAL2 owner.

## Connect Codex

Use the Streamable HTTP URL `https://brief.z2zs.space/api/mcp`. In Codex desktop, add it under **Settings → MCP servers**, save, and restart Codex. For CLI configuration:

```toml
[mcp_servers.lumixia_brief]
url = "https://brief.z2zs.space/api/mcp"
auth = "oauth"
default_tools_approval_mode = "writes"
```

Run `codex mcp login lumixia_brief` if interactive authorization has not started. Sign in with Google, complete TOTP, review the requested scopes and client details, then approve consent.

The grant is recorded before Supabase issues the authorization code. If the grant cannot be stored, consent stops and Codex receives no usable authorization. A reconnect renews the grant for 30 days.

## Synthetic smoke test

1. List projects.
2. Create a clearly synthetic project using a stable client-generated UUID.
3. Read its context.
4. Record at least five structured interview turns; repeat one request and verify the result is idempotent.
5. Save a structured draft; repeat it and verify the same version is returned.
6. Open the web app, review the draft, and confirm approval/Notion sync are still unavailable to MCP and require a human action.
7. Inspect sanitized logs for request metadata only; do not record tool arguments or results as evidence.

## Revoke or disable

- Run `select public.revoke_codex_connections()` from an owner-authenticated AAL2 operation (or use the product control when available) to end the owner's Codex connections immediately. RLS rejects existing OAuth tokens as soon as the grant is revoked.
- Set `CODEX_MCP_MODE=disabled` and redeploy to remove metadata and MCP availability globally.
- Do not disable native Supabase Auth, RLS, or the web application's TOTP requirement.
