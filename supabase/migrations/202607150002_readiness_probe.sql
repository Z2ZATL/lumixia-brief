create or replace function public.readiness_check()
returns boolean
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select true;
$$;

revoke all on function public.readiness_check() from public;
grant execute on function public.readiness_check() to anon, authenticated;
