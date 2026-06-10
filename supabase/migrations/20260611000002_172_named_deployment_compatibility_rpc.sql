-- Use a named argument so PostgREST can reliably expose the compatibility check.

create or replace function public.assert_deployment_compatibility(
  p_required_version integer
)
returns integer
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  v_deployed_version constant integer := 165;
begin
  if p_required_version > v_deployed_version then
    raise exception 'Database deployment version % is older than required version %.',
      v_deployed_version,
      p_required_version;
  end if;

  return v_deployed_version;
end;
$$;

revoke all on function public.assert_deployment_compatibility(integer) from public;
grant execute on function public.assert_deployment_compatibility(integer)
  to anon, authenticated, service_role;

select pg_notify('pgrst', 'reload schema');
