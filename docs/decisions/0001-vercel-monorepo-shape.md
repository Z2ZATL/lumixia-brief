# ADR-0001: One Vercel project with Vite and Express

- Status: accepted
- Date: 2026-07-14

## Context

The Build Week demo needs one URL, simple review, preview deployments, and a server boundary for secrets and provider calls. Docker is useful for local infrastructure but is not the intended Vercel runtime.

## Decision

Keep a single npm repository. Vite builds the React client to `dist`; Vercel rewrites `/api/*` to `api/index.ts`, which exports one Express app. Core contracts and deterministic domain rules are shared TypeScript modules. Docker verifies Linux/amd64 portability and local Supabase only.

## Consequences

- One deployment and origin simplify Clerk, Notion callbacks, CORS, and the demo.
- Express endpoints share one function bundle, so provider/database calls must stay bounded.
- Static assets must remain in Vite rather than Express.
