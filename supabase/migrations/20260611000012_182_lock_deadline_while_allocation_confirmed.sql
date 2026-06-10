-- Keep the reservation deadline closed while a confirmed allocation exists.

create or replace function public.update_app_setting_as_global_admin(
  p_key text,
  p_value jsonb
)
returns public.app_settings
language plpgsql security definer set search_path = public
as $$
declare
  v_row public.app_settings;
  v_deadline_at timestamptz;
begin
  if not public.is_global_admin() then raise exception 'Only global admins can update app settings.'; end if;
  if p_key not in (
    'first_reservation_deadline',
    'seoul_district_transfer_account',
    'participation_targets',
    'global_scenario_checklist',
    'simulation_enabled'
  ) then raise exception 'Setting key is not editable through this RPC.'; end if;
  if jsonb_typeof(p_value) <> 'object' then raise exception 'Setting value must be a JSON object.'; end if;

  if p_key = 'first_reservation_deadline' then
    v_deadline_at := nullif(p_value ->> 'deadline_at', '')::timestamptz;
    perform pg_advisory_xact_lock(hashtextextended('allocation-confirmation', 0));

    if (v_deadline_at is null or v_deadline_at > clock_timestamp())
      and exists (
        select 1
        from public.bus_allocations
        where allocation_data ->> 'status' = 'confirmed'
      ) then
      raise exception 'Cancel the confirmed allocation before reopening reservations.';
    end if;
  elsif p_key = 'seoul_district_transfer_account'
    and jsonb_typeof(p_value -> 'account_number') <> 'string' then
    raise exception 'Account number must be a string.';
  elsif p_key = 'participation_targets'
    and (jsonb_typeof(p_value -> 'rows') <> 'array' or jsonb_typeof(p_value -> 'targets') <> 'object') then
    raise exception 'Invalid participation targets.';
  elsif p_key = 'global_scenario_checklist'
    and jsonb_typeof(p_value -> 'checked_step_ids') <> 'array' then
    raise exception 'Invalid scenario checklist.';
  elsif p_key = 'simulation_enabled'
    and jsonb_typeof(p_value -> 'enabled') <> 'boolean' then
    raise exception 'Simulation enabled must be boolean.';
  end if;

  insert into public.app_settings (key, value, updated_at)
  values (p_key, p_value, now())
  on conflict (key) do update set value = excluded.value, updated_at = now()
  returning * into v_row;
  return v_row;
end;
$$;

revoke all on function public.update_app_setting_as_global_admin(text, jsonb) from public, anon;
grant execute on function public.update_app_setting_as_global_admin(text, jsonb) to authenticated;

notify pgrst, 'reload schema';
