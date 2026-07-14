alter table public.projects
  add column if not exists revision integer not null default 1 check (revision > 0);

update public.projects
set document = document || jsonb_build_object('revision', revision)
where not (document ? 'revision');

create or replace function app.has_mfa()
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select
    coalesce(auth.jwt() ->> 'aal', '') = 'aal2'
    or coalesce(auth.jwt() -> 'fva' ->> 1, '-1') ~ '^\d+$';
$$;

revoke all on function app.has_mfa() from public;
grant execute on function app.has_mfa() to authenticated;

comment on column public.projects.revision is
  'Monotonic optimistic concurrency revision mirrored in the project document.';

alter table public.answer_claims
  add column if not exists status text not null default 'processed',
  add column if not exists payload jsonb not null default '{}'::jsonb,
  add column if not exists result jsonb,
  add column if not exists error_code text,
  add column if not exists lease_expires_at timestamptz,
  add column if not exists updated_at timestamptz not null default now();

alter table public.answer_claims
  drop constraint if exists answer_claims_status_check;
alter table public.answer_claims
  add constraint answer_claims_status_check
  check (status in ('pending', 'processed', 'failed'));

create unique index if not exists answer_claims_one_pending_per_project_idx
  on public.answer_claims (project_id)
  where status = 'pending';

create or replace function public.claim_interview_turn(
  p_owner_id text,
  p_project_id uuid,
  p_client_answer_id uuid,
  p_payload jsonb,
  p_retry_failed boolean default false
)
returns table (
  claim_state text,
  turn_status text,
  turn_result jsonb,
  turn_error_code text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  existing public.answer_claims%rowtype;
begin
  if not app.is_owner(p_owner_id) then
    raise insufficient_privilege using message = 'owner with MFA required';
  end if;
  if not exists (
    select 1 from public.projects p
    where p.id = p_project_id and p.owner_id = p_owner_id
  ) then
    raise insufficient_privilege using message = 'project ownership required';
  end if;

  select * into existing
  from public.answer_claims
  where owner_id = p_owner_id
    and project_id = p_project_id
    and client_answer_id = p_client_answer_id;

  if found then
    if existing.payload <> p_payload then
      return query select 'conflict', existing.status, null::jsonb, null::text;
      return;
    end if;
    if (existing.status = 'failed' and p_retry_failed)
      or (existing.status = 'pending' and existing.lease_expires_at <= now()) then
      update public.answer_claims
      set status = 'pending', error_code = null, result = null,
          lease_expires_at = now() + interval '45 seconds', updated_at = now()
      where id = existing.id;
      return query select 'claimed', 'pending', null::jsonb, null::text;
      return;
    end if;
    return query
      select 'duplicate', existing.status, existing.result, existing.error_code;
    return;
  end if;

  if exists (
    select 1 from public.answer_claims
    where owner_id = p_owner_id and project_id = p_project_id
      and status = 'pending' and lease_expires_at > now()
  ) then
    return query select 'busy', 'pending', null::jsonb, null::text;
    return;
  end if;

  update public.answer_claims
  set status = 'failed', error_code = 'LEASE_EXPIRED', updated_at = now()
  where owner_id = p_owner_id and project_id = p_project_id
    and status = 'pending' and lease_expires_at <= now();

  begin
    insert into public.answer_claims (
      owner_id, project_id, client_answer_id, status, payload, lease_expires_at
    ) values (
      p_owner_id, p_project_id, p_client_answer_id, 'pending', p_payload,
      now() + interval '45 seconds'
    );
  exception when unique_violation then
    return query select 'busy', 'pending', null::jsonb, null::text;
    return;
  end;
  return query select 'claimed', 'pending', null::jsonb, null::text;
end;
$$;

create or replace function public.complete_interview_turn(
  p_owner_id text,
  p_project_id uuid,
  p_client_answer_id uuid,
  p_status text,
  p_result jsonb,
  p_error_code text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  affected integer;
begin
  if not app.is_owner(p_owner_id) or not exists (
    select 1 from public.projects p
    where p.id = p_project_id and p.owner_id = p_owner_id
  ) then
    raise insufficient_privilege using message = 'owner with MFA required';
  end if;
  if p_status not in ('processed', 'failed') then
    raise check_violation using message = 'invalid terminal turn status';
  end if;
  update public.answer_claims
  set status = p_status, result = p_result, error_code = p_error_code,
      lease_expires_at = null, updated_at = now()
  where owner_id = p_owner_id and project_id = p_project_id
    and client_answer_id = p_client_answer_id and status = 'pending';
  get diagnostics affected = row_count;
  return affected = 1;
end;
$$;

create or replace function public.compare_and_save_project(
  p_owner_id text,
  p_project_id uuid,
  p_expected_revision integer,
  p_document jsonb,
  p_title text,
  p_workflow_status text,
  p_sync_status text,
  p_updated_at timestamptz
)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  affected integer;
begin
  update public.projects
  set document = p_document,
      title = p_title,
      workflow_status = p_workflow_status,
      sync_status = p_sync_status,
      updated_at = p_updated_at,
      revision = p_expected_revision + 1
  where id = p_project_id and owner_id = p_owner_id
    and revision = p_expected_revision;
  get diagnostics affected = row_count;
  return affected;
end;
$$;

revoke all on function public.claim_interview_turn(text, uuid, uuid, jsonb, boolean) from public;
revoke all on function public.complete_interview_turn(text, uuid, uuid, text, jsonb, text) from public;
revoke all on function public.compare_and_save_project(text, uuid, integer, jsonb, text, text, text, timestamptz) from public;
grant execute on function public.claim_interview_turn(text, uuid, uuid, jsonb, boolean) to authenticated;
grant execute on function public.complete_interview_turn(text, uuid, uuid, text, jsonb, text) to authenticated;
grant execute on function public.compare_and_save_project(text, uuid, integer, jsonb, text, text, text, timestamptz) to authenticated;

alter table public.notion_syncs
  add column if not exists operation_id uuid not null default gen_random_uuid(),
  add column if not exists lease_expires_at timestamptz,
  add column if not exists content_hash text not null default '';

create or replace function public.claim_notion_sync(
  p_owner_id text,
  p_project_id uuid,
  p_brief_version integer,
  p_operation_id uuid,
  p_content_hash text,
  p_known_page_id text,
  p_lease_expires_at timestamptz
)
returns table (
  claim_state text,
  owner_id text,
  project_id uuid,
  brief_version integer,
  notion_page_id text,
  sync_status text,
  error_code text,
  operation_id uuid,
  lease_expires_at timestamptz,
  content_hash text,
  updated_at timestamptz
)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  existing public.notion_syncs%rowtype;
  inserted integer;
begin
  if not app.is_owner(p_owner_id) then
    raise insufficient_privilege using message = 'owner with MFA required';
  end if;
  select * into existing from public.notion_syncs n
  where n.owner_id = p_owner_id and n.project_id = p_project_id
    and n.brief_version = p_brief_version;
  if found then
    if existing.content_hash <> '' and existing.content_hash <> p_content_hash then
      return query select 'conflict', existing.owner_id, existing.project_id,
        existing.brief_version, existing.notion_page_id, existing.status, existing.error_code,
        existing.operation_id, existing.lease_expires_at, existing.content_hash,
        existing.updated_at;
      return;
    end if;
    if existing.status = 'synced' then
      return query select 'synced', existing.owner_id, existing.project_id,
        existing.brief_version, existing.notion_page_id, existing.status, existing.error_code,
        existing.operation_id, existing.lease_expires_at, existing.content_hash,
        existing.updated_at;
      return;
    end if;
    if existing.status = 'syncing' and existing.lease_expires_at > now() then
      return query select 'syncing', existing.owner_id, existing.project_id,
        existing.brief_version, existing.notion_page_id, existing.status, existing.error_code,
        existing.operation_id, existing.lease_expires_at, existing.content_hash,
        existing.updated_at;
      return;
    end if;
    update public.notion_syncs n
    set operation_id = p_operation_id, lease_expires_at = p_lease_expires_at,
        content_hash = p_content_hash,
        notion_page_id = coalesce(n.notion_page_id, p_known_page_id),
        status = 'syncing', error_code = null, updated_at = now()
    where n.id = existing.id
    returning * into existing;
    return query select 'claimed', existing.owner_id, existing.project_id,
      existing.brief_version, existing.notion_page_id, existing.status, existing.error_code,
      existing.operation_id, existing.lease_expires_at, existing.content_hash,
      existing.updated_at;
    return;
  end if;

  insert into public.notion_syncs (
    owner_id, project_id, brief_version, notion_page_id, status, error_code,
    operation_id, lease_expires_at, content_hash, updated_at
  ) values (
    p_owner_id, p_project_id, p_brief_version, p_known_page_id, 'syncing', null,
    p_operation_id, p_lease_expires_at, p_content_hash, now()
  ) on conflict on constraint notion_syncs_project_id_brief_version_key do nothing;
  get diagnostics inserted = row_count;
  select * into existing from public.notion_syncs n
  where n.owner_id = p_owner_id and n.project_id = p_project_id
    and n.brief_version = p_brief_version;
  return query select case when inserted = 1 then 'claimed' else 'syncing' end,
    existing.owner_id, existing.project_id, existing.brief_version, existing.notion_page_id,
    existing.status, existing.error_code, existing.operation_id, existing.lease_expires_at,
    existing.content_hash, existing.updated_at;
end;
$$;

create or replace function public.complete_notion_sync(
  p_owner_id text,
  p_project_id uuid,
  p_brief_version integer,
  p_operation_id uuid,
  p_notion_page_id text,
  p_status text,
  p_error_code text
)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  affected integer;
begin
  if p_status not in ('synced', 'error') then
    raise check_violation using message = 'invalid terminal sync status';
  end if;
  update public.notion_syncs n
  set notion_page_id = coalesce(p_notion_page_id, n.notion_page_id), status = p_status,
      error_code = p_error_code, lease_expires_at = null, updated_at = now()
  where n.owner_id = p_owner_id and n.project_id = p_project_id
    and n.brief_version = p_brief_version and n.operation_id = p_operation_id
    and n.status = 'syncing';
  get diagnostics affected = row_count;
  return affected = 1;
end;
$$;

revoke all on function public.claim_notion_sync(text, uuid, integer, uuid, text, text, timestamptz) from public;
revoke all on function public.complete_notion_sync(text, uuid, integer, uuid, text, text, text) from public;
grant execute on function public.claim_notion_sync(text, uuid, integer, uuid, text, text, timestamptz) to authenticated;
grant execute on function public.complete_notion_sync(text, uuid, integer, uuid, text, text, text) to authenticated;

create table if not exists public.rate_limit_buckets (
  owner_id text not null,
  bucket text not null,
  window_started_at timestamptz not null,
  request_count integer not null check (request_count > 0),
  primary key (owner_id, bucket)
);

alter table public.rate_limit_buckets enable row level security;
alter table public.rate_limit_buckets force row level security;

create or replace function public.consume_rate_limit(
  p_owner_id text,
  p_bucket text,
  p_points integer,
  p_duration_seconds integer
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  next_count integer;
begin
  if not app.is_owner(p_owner_id) then
    raise insufficient_privilege using message = 'owner with MFA required';
  end if;
  if p_points < 1 or p_duration_seconds < 1 or char_length(p_bucket) > 300 then
    raise check_violation using message = 'invalid rate limit';
  end if;
  insert into public.rate_limit_buckets as bucket (
    owner_id, bucket, window_started_at, request_count
  ) values (p_owner_id, p_bucket, now(), 1)
  on conflict (owner_id, bucket) do update
  set window_started_at = case
        when bucket.window_started_at <= now() - make_interval(secs => p_duration_seconds)
          then now()
        else bucket.window_started_at
      end,
      request_count = case
        when bucket.window_started_at <= now() - make_interval(secs => p_duration_seconds)
          then 1
        else bucket.request_count + 1
      end
  returning request_count into next_count;
  return next_count <= p_points;
end;
$$;

revoke all on table public.rate_limit_buckets from anon, authenticated;
revoke all on function public.consume_rate_limit(text, text, integer, integer) from public;
grant execute on function public.consume_rate_limit(text, text, integer, integer) to authenticated;
