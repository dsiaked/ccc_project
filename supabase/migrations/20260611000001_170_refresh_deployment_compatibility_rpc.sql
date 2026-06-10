-- Recreate the deployment compatibility RPC and force PostgREST to refresh it.

create or replace function public.get_deployment_compatibility_version()
returns integer
language sql
stable
security invoker
set search_path = public
as $$
  select 165;
$$;

revoke all on function public.get_deployment_compatibility_version() from public;
grant execute on function public.get_deployment_compatibility_version()
  to anon, authenticated, service_role;

select pg_notify('pgrst', 'reload schema');
