-- BL-016: Supabase Auth is the sole identity provider; only its native AAL claim is valid.
create or replace function app.has_mfa()
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select coalesce(auth.jwt() ->> 'aal', 'aal1') = 'aal2';
$$;

revoke all on function app.has_mfa() from public;
grant execute on function app.has_mfa() to authenticated;
