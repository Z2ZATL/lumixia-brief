create extension if not exists pgcrypto with schema extensions;
create schema if not exists app;

create or replace function app.has_mfa()
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select
    coalesce(auth.jwt() ->> 'aal', '') = 'aal2'
    or coalesce(auth.jwt() -> 'fva' ->> 1, '-1') ~ '^\d+$'
    or coalesce(auth.jwt() -> 'amr', '[]'::jsonb) ?| array['mfa', 'totp', 'otp'];
$$;

create or replace function app.is_owner(row_owner_id text)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select coalesce(auth.jwt() ->> 'sub', '') = row_owner_id and app.has_mfa();
$$;

create table public.projects (
  id uuid primary key,
  owner_id text not null,
  title text not null check (char_length(title) between 2 and 120),
  workflow_status text not null check (workflow_status in ('draft', 'interviewing', 'needs_review', 'approved')),
  sync_status text not null check (sync_status in ('not_synced', 'syncing', 'synced', 'error')),
  document jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index projects_owner_updated_idx on public.projects (owner_id, updated_at desc);

create table public.answer_claims (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  owner_id text not null,
  client_answer_id uuid not null,
  created_at timestamptz not null default now(),
  unique (project_id, client_answer_id)
);
create index answer_claims_owner_project_idx on public.answer_claims (owner_id, project_id);

create table public.notion_connections (
  owner_id text primary key,
  access_token_encrypted text not null,
  refresh_token_encrypted text,
  workspace_id text not null,
  workspace_name text,
  bot_id text,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.notion_syncs (
  id uuid primary key default gen_random_uuid(),
  owner_id text not null,
  project_id uuid not null references public.projects(id) on delete cascade,
  brief_version integer not null check (brief_version > 0),
  notion_page_id text,
  status text not null check (status in ('syncing', 'synced', 'error')),
  error_code text,
  updated_at timestamptz not null default now(),
  unique (project_id, brief_version)
);

alter table public.projects enable row level security;
alter table public.projects force row level security;
alter table public.answer_claims enable row level security;
alter table public.answer_claims force row level security;
alter table public.notion_connections enable row level security;
alter table public.notion_connections force row level security;
alter table public.notion_syncs enable row level security;
alter table public.notion_syncs force row level security;

create policy projects_select_owner_mfa on public.projects
  for select to authenticated using (app.is_owner(owner_id));
create policy projects_insert_owner_mfa on public.projects
  for insert to authenticated with check (app.is_owner(owner_id));
create policy projects_update_owner_mfa on public.projects
  for update to authenticated using (app.is_owner(owner_id)) with check (app.is_owner(owner_id));
create policy projects_delete_owner_mfa on public.projects
  for delete to authenticated using (app.is_owner(owner_id));

create policy answer_claims_select_owner_mfa on public.answer_claims
  for select to authenticated using (app.is_owner(owner_id));
create policy answer_claims_insert_owner_mfa on public.answer_claims
  for insert to authenticated with check (
    app.is_owner(owner_id)
    and exists (
      select 1 from public.projects p
      where p.id = answer_claims.project_id and p.owner_id = answer_claims.owner_id
    )
  );
create policy answer_claims_delete_owner_mfa on public.answer_claims
  for delete to authenticated using (app.is_owner(owner_id));

create policy notion_connections_select_owner_mfa on public.notion_connections
  for select to authenticated using (app.is_owner(owner_id));
create policy notion_connections_insert_owner_mfa on public.notion_connections
  for insert to authenticated with check (app.is_owner(owner_id));
create policy notion_connections_update_owner_mfa on public.notion_connections
  for update to authenticated using (app.is_owner(owner_id)) with check (app.is_owner(owner_id));
create policy notion_connections_delete_owner_mfa on public.notion_connections
  for delete to authenticated using (app.is_owner(owner_id));

create policy notion_syncs_select_owner_mfa on public.notion_syncs
  for select to authenticated using (app.is_owner(owner_id));
create policy notion_syncs_insert_owner_mfa on public.notion_syncs
  for insert to authenticated with check (
    app.is_owner(owner_id)
    and exists (
      select 1 from public.projects p
      where p.id = notion_syncs.project_id and p.owner_id = notion_syncs.owner_id
    )
  );
create policy notion_syncs_update_owner_mfa on public.notion_syncs
  for update to authenticated using (app.is_owner(owner_id)) with check (app.is_owner(owner_id));
create policy notion_syncs_delete_owner_mfa on public.notion_syncs
  for delete to authenticated using (app.is_owner(owner_id));

revoke all on function app.has_mfa() from public;
revoke all on function app.is_owner(text) from public;
grant execute on function app.has_mfa() to authenticated;
grant execute on function app.is_owner(text) to authenticated;
grant usage on schema app to authenticated;
grant select, insert, update, delete on public.projects to authenticated;
grant select, insert, delete on public.answer_claims to authenticated;
grant select, insert, update, delete on public.notion_connections to authenticated;
grant select, insert, update, delete on public.notion_syncs to authenticated;

comment on table public.projects is 'Owner-scoped project documents. Application content must never be included in logs.';
comment on table public.notion_connections is 'AES-256-GCM encrypted OAuth credentials. Plaintext tokens are forbidden.';
