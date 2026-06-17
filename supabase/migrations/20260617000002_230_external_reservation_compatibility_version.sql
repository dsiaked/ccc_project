-- Require databases to include the external public reservation save hotfix
-- before serving frontend deployments that expose external-district signup.

create or replace function public.get_deployment_compatibility_version()
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select 230;
$$;

create or replace function public.assert_deployment_compatibility(
  p_required_version integer
)
returns integer
language plpgsql
stable
set search_path = public
as $$
declare
  v_deployed_version constant integer := 230;
begin
  if p_required_version > v_deployed_version then
    raise exception 'Database deployment version % is older than required version %.',
      v_deployed_version,
      p_required_version;
  end if;

  return v_deployed_version;
end;
$$;

revoke all on function public.get_deployment_compatibility_version() from public;
grant execute on function public.get_deployment_compatibility_version()
  to anon, authenticated, service_role;

revoke all on function public.assert_deployment_compatibility(integer) from public;
grant execute on function public.assert_deployment_compatibility(integer)
  to anon, authenticated, service_role;

notify pgrst, 'reload schema';
