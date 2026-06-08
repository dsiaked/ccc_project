-- Include the configured bus option maximum in every new optimization snapshot.

create or replace function public.get_allocation_optimizer_config()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_config jsonb;
  v_maximum_buses integer;
begin
  if auth.uid() is null or not public.is_global_admin() then
    raise exception 'Only global admins can view allocation optimizer configuration.';
  end if;

  select value
  into v_config
  from public.app_settings
  where key = 'allocation_optimizer_config';

  select max_count
  into v_maximum_buses
  from public.bus_options
  order by created_at desc, id desc
  limit 1;

  v_config := coalesce(
    v_config,
    jsonb_build_object(
      'capacity', 45,
      'price', 0,
      'recommended_minimum_passengers', 36
    )
  );

  return jsonb_set(
    v_config,
    '{maximum_buses}',
    to_jsonb(coalesce(v_maximum_buses, 999)),
    true
  );
end;
$$;

revoke all on function public.get_allocation_optimizer_config()
  from public, anon;
grant execute on function public.get_allocation_optimizer_config()
  to authenticated;

notify pgrst, 'reload schema';
