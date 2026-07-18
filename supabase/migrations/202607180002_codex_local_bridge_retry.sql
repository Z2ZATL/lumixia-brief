-- BL-019: allow an owner-operated Codex bridge to recover a failed model turn.
-- The replacement payload is accepted only after the existing turn reached the terminal failed
-- state and the authenticated owner explicitly requests a retry. Processed turns stay immutable.

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
    if existing.status = 'failed' and p_retry_failed then
      update public.answer_claims
      set payload = p_payload,
          status = 'pending',
          error_code = null,
          result = null,
          lease_expires_at = now() + interval '45 seconds',
          updated_at = now()
      where id = existing.id;
      return query select 'claimed', 'pending', null::jsonb, null::text;
      return;
    end if;
    if existing.payload <> p_payload then
      return query select 'conflict', existing.status, null::jsonb, null::text;
      return;
    end if;
    if existing.status = 'pending' and existing.lease_expires_at <= now() then
      update public.answer_claims
      set status = 'pending',
          error_code = null,
          result = null,
          lease_expires_at = now() + interval '45 seconds',
          updated_at = now()
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
    where owner_id = p_owner_id
      and project_id = p_project_id
      and status = 'pending'
      and lease_expires_at > now()
  ) then
    return query select 'busy', 'pending', null::jsonb, null::text;
    return;
  end if;

  update public.answer_claims
  set status = 'failed', error_code = 'LEASE_EXPIRED', updated_at = now()
  where owner_id = p_owner_id
    and project_id = p_project_id
    and status = 'pending'
    and lease_expires_at <= now();

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

revoke all on function public.claim_interview_turn(text, uuid, uuid, jsonb, boolean) from public;
grant execute on function public.claim_interview_turn(text, uuid, uuid, jsonb, boolean)
  to authenticated;

comment on function public.claim_interview_turn(text, uuid, uuid, jsonb, boolean) is
  'Idempotently leases one interview turn; failed owner turns may replace payload during retry.';
