# Codex MCP operations runbook

## Purpose

Connect Codex desktop, CLI, or IDE to Lumixia Brief as the authenticated project owner. The connection uses the owner's Codex access and never reads `OPENAI_API_KEY`.

## Hosted configuration

1. In Supabase Auth, use an asymmetric signing key and enable OAuth Server.
2. Set the authorization path to `/oauth/consent`.
3. Enable Dynamic Client Registration so Codex can register its OAuth client.
4. Keep Google as the sign-in provider and TOTP as the mandatory AAL2 factor.
5. Deploy with `CODEX_MCP_MODE=enabled`, native Supabase Auth, Supabase data, and exact production origins.

Supabase OAuth access tokens retain the standard `authenticated` audience. Lumixia additionally requires an OAuth `client_id`, UUID subject, authenticated role, exact issuer, unexpired token, and `aal2`; RLS still enforces ownership.

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

## Synthetic smoke test

1. List projects.
2. Create a clearly synthetic project using a stable client-generated UUID.
3. Read its context.
4. Record at least five structured interview turns; repeat one request and verify the result is idempotent.
5. Save a structured draft; repeat it and verify the same version is returned.
6. Open the web app, review the draft, and confirm approval/Notion sync are still unavailable to MCP and require a human action.
7. Inspect sanitized logs for request metadata only; do not record tool arguments or results as evidence.

## Revoke or disable

- Revoke the Codex OAuth grant in Supabase to end one owner's connection.
- Set `CODEX_MCP_MODE=disabled` and redeploy to remove metadata and MCP availability globally.
- Do not disable native Supabase Auth, RLS, or the web application's TOTP requirement.
