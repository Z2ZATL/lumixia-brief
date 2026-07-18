-- BL-018: transfer an explicit, time-bounded AAL2 consent decision to a Codex OAuth session.
-- Supabase OAuth Server creates a separate AAL1 session even when its consent UI is opened
-- from an AAL2 browser session. This grant records that the owner approved the exact OAuth
-- client while using a direct AAL2 session; it does not rewrite or misrepresent the OAuth AAL.

create table if not exists app.codex_oauth_grants (
  owner_id text not null,
  client_id text not null check (char_length(client_id) between 1 and 200),
  verified_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  primary key (owner_id, client_id)
);

alter table app.codex_oauth_grants enable row level security;
alter table app.codex_oauth_grants force row level security;

create policy codex_grants_select_owner
  on app.codex_oauth_grants
  for select to authenticated
  using (coalesce(auth.jwt() ->> 'sub', '') = owner_id);

create policy codex_grants_insert_direct_aal2
  on app.codex_oauth_grants
  for insert to authenticated
  with check (
    coalesce(auth.jwt() ->> 'sub', '') = owner_id
    and coalesce(auth.jwt() ->> 'aal', 'aal1') = 'aal2'
    and nullif(auth.jwt() ->> 'client_id', '') is null
  );

create policy codex_grants_update_direct_aal2
  on app.codex_oauth_grants
  for update to authenticated
  using (
    coalesce(auth.jwt() ->> 'sub', '') = owner_id
    and coalesce(auth.jwt() ->> 'aal', 'aal1') = 'aal2'
    and nullif(auth.jwt() ->> 'client_id', '') is null
  )
  with check (
    coalesce(auth.jwt() ->> 'sub', '') = owner_id
    and coalesce(auth.jwt() ->> 'aal', 'aal1') = 'aal2'
    and nullif(auth.jwt() ->> 'client_id', '') is null
  );

create policy codex_grants_delete_direct_aal2
  on app.codex_oauth_grants
  for delete to authenticated
  using (
    coalesce(auth.jwt() ->> 'sub', '') = owner_id
    and coalesce(auth.jwt() ->> 'aal', 'aal1') = 'aal2'
    and nullif(auth.jwt() ->> 'client_id', '') is null
  );

grant select, insert, update, delete on app.codex_oauth_grants to authenticated;

create or replace function app.has_codex_oauth_grant()
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select exists (
    select 1
    from app.codex_oauth_grants grant_record
    where grant_record.owner_id = coalesce(auth.jwt() ->> 'sub', '')
      and grant_record.client_id = coalesce(auth.jwt() ->> 'client_id', '')
      and grant_record.revoked_at is null
      and grant_record.expires_at > now()
  );
$$;

create or replace function app.is_direct_aal2()
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select coalesce(auth.jwt() ->> 'aal', 'aal1') = 'aal2'
    and nullif(auth.jwt() ->> 'client_id', '') is null;
$$;

create or replace function app.is_codex_oauth()
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select nullif(auth.jwt() ->> 'client_id', '') is not null
    and app.has_codex_oauth_grant();
$$;

create or replace function app.has_mfa()
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select app.is_direct_aal2() or app.is_codex_oauth();
$$;

create or replace function public.authorize_codex_connection(p_client_id text)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  owner text := coalesce(auth.jwt() ->> 'sub', '');
begin
  if not app.is_direct_aal2() or owner = '' then
    raise insufficient_privilege using message = 'direct AAL2 session required';
  end if;
  if p_client_id is null or char_length(trim(p_client_id)) not between 1 and 200 then
    raise check_violation using message = 'invalid OAuth client';
  end if;
  insert into app.codex_oauth_grants as grant_record (
    owner_id, client_id, verified_at, expires_at, revoked_at
  ) values (
    owner, trim(p_client_id), now(), now() + interval '30 days', null
  )
  on conflict (owner_id, client_id) do update
  set verified_at = excluded.verified_at,
      expires_at = excluded.expires_at,
      revoked_at = null;
  return true;
end;
$$;

create or replace function public.verify_codex_oauth_grant()
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select app.is_codex_oauth();
$$;

create or replace function public.revoke_codex_connections()
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  affected integer;
begin
  if not app.is_direct_aal2() then
    raise insufficient_privilege using message = 'direct AAL2 session required';
  end if;
  update app.codex_oauth_grants
  set revoked_at = now()
  where owner_id = coalesce(auth.jwt() ->> 'sub', '')
    and revoked_at is null;
  get diagnostics affected = row_count;
  return affected;
end;
$$;

revoke all on function app.has_codex_oauth_grant() from public;
revoke all on function app.is_direct_aal2() from public;
revoke all on function app.is_codex_oauth() from public;
revoke all on function public.authorize_codex_connection(text) from public;
revoke all on function public.verify_codex_oauth_grant() from public;
revoke all on function public.revoke_codex_connections() from public;
grant execute on function app.has_codex_oauth_grant() to authenticated;
grant execute on function app.is_direct_aal2() to authenticated;
grant execute on function app.is_codex_oauth() to authenticated;
grant execute on function public.authorize_codex_connection(text) to authenticated;
grant execute on function public.verify_codex_oauth_grant() to authenticated;
grant execute on function public.revoke_codex_connections() to authenticated;

-- These functions were originally security-definer operations. Running them as the caller makes
-- the direct-session-only Notion RLS boundary effective for every code path.
alter function public.claim_notion_sync(text, uuid, integer, uuid, text, text, timestamptz)
  security invoker;
alter function public.complete_notion_sync(text, uuid, integer, uuid, text, text, text)
  security invoker;

-- OAuth tokens are limited to draft/interview work. Approval, deletion, and Notion remain
-- direct-session actions even if a client bypasses the MCP transport and calls PostgREST.
create policy projects_codex_insert_boundary
  on public.projects as restrictive
  for insert to authenticated
  with check (
    app.is_direct_aal2()
    or (
      app.is_codex_oauth()
      and workflow_status in ('draft', 'interviewing', 'needs_review')
      and sync_status = 'not_synced'
      and document ->> 'ownerId' = owner_id
      and document ->> 'workflowStatus' = workflow_status
      and document ->> 'syncStatus' = sync_status
      and coalesce(document -> 'notionParentId', 'null'::jsonb) = 'null'::jsonb
      and coalesce(document -> 'notionPageId', 'null'::jsonb) = 'null'::jsonb
      and coalesce(document -> 'lastSyncError', 'null'::jsonb) = 'null'::jsonb
      and not jsonb_path_exists(
        coalesce(document -> 'briefVersions', '[]'::jsonb),
        '$[*] ? (@.status == "approved" || @.approvedAt != null || @.approvedBy != null)'
      )
    )
  );

create policy projects_codex_update_boundary
  on public.projects as restrictive
  for update to authenticated
  using (app.is_direct_aal2() or app.is_codex_oauth())
  with check (
    app.is_direct_aal2()
    or (
      app.is_codex_oauth()
      and workflow_status in ('draft', 'interviewing', 'needs_review')
      and sync_status = 'not_synced'
      and document ->> 'ownerId' = owner_id
      and document ->> 'workflowStatus' = workflow_status
      and document ->> 'syncStatus' = sync_status
      and coalesce(document -> 'notionParentId', 'null'::jsonb) = 'null'::jsonb
      and coalesce(document -> 'notionPageId', 'null'::jsonb) = 'null'::jsonb
      and coalesce(document -> 'lastSyncError', 'null'::jsonb) = 'null'::jsonb
      and not jsonb_path_exists(
        coalesce(document -> 'briefVersions', '[]'::jsonb),
        '$[*] ? (@.status == "approved" || @.approvedAt != null || @.approvedBy != null)'
      )
    )
  );

create policy projects_delete_direct_only
  on public.projects as restrictive
  for delete to authenticated
  using (app.is_direct_aal2());

create policy answer_claims_delete_direct_only
  on public.answer_claims as restrictive
  for delete to authenticated
  using (app.is_direct_aal2());

create policy notion_connections_direct_only
  on public.notion_connections as restrictive
  for all to authenticated
  using (app.is_direct_aal2())
  with check (app.is_direct_aal2());

create policy notion_syncs_direct_only
  on public.notion_syncs as restrictive
  for all to authenticated
  using (app.is_direct_aal2())
  with check (app.is_direct_aal2());

comment on table app.codex_oauth_grants is
  'Time-bounded transfer of an explicit direct-AAL2 consent decision to one OAuth client. Contains no tokens or user content.';
