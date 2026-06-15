-- Support a reservation opening time and enforce it for user reservation writes.

alter function public.save_user_reservation(text, text, text, text, text, jsonb, jsonb)
  rename to save_user_reservation_without_opening_check;

revoke all on function public.save_user_reservation_without_opening_check(
  text, text, text, text, text, jsonb, jsonb
) from public, anon, authenticated;

create function public.save_user_reservation(
  p_name text,
  p_phone text,
  p_district text,
  p_team text,
  p_campus text,
  p_station_preferences jsonb,
  p_data jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_opens_at timestamptz;
begin
  select nullif(value ->> 'opens_at', '')::timestamptz
  into v_opens_at
  from public.app_settings
  where key = 'first_reservation_deadline'
  for share;

  if v_opens_at is not null and v_opens_at > clock_timestamp() then
    raise exception 'Reservation window has not opened yet.';
  end if;

  return public.save_user_reservation_without_opening_check(
    p_name,
    p_phone,
    p_district,
    p_team,
    p_campus,
    p_station_preferences,
    p_data
  );
end;
$$;

revoke all on function public.save_user_reservation(
  text, text, text, text, text, jsonb, jsonb
) from public, anon;
grant execute on function public.save_user_reservation(
  text, text, text, text, text, jsonb, jsonb
) to authenticated;

alter function public.delete_user_reservation()
  rename to delete_user_reservation_without_opening_check;

revoke all on function public.delete_user_reservation_without_opening_check()
  from public, anon, authenticated;

create function public.delete_user_reservation()
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_opens_at timestamptz;
begin
  select nullif(value ->> 'opens_at', '')::timestamptz
  into v_opens_at
  from public.app_settings
  where key = 'first_reservation_deadline'
  for share;

  if v_opens_at is not null and v_opens_at > clock_timestamp() then
    raise exception 'Reservation window has not opened yet.';
  end if;

  return public.delete_user_reservation_without_opening_check();
end;
$$;

revoke all on function public.delete_user_reservation() from public, anon;
grant execute on function public.delete_user_reservation() to authenticated;

create or replace function public.update_app_setting_as_global_admin(
  p_key text,
  p_value jsonb
)
returns public.app_settings
language plpgsql security definer set search_path = public
as $$
declare
  v_row public.app_settings;
  v_opens_at timestamptz;
  v_deadline_at timestamptz;
begin
  if not public.is_global_admin() then raise exception 'Only global admins can update app settings.'; end if;
  if p_key not in (
    'first_reservation_deadline',
    'seoul_district_transfer_account',
    'participation_targets',
    'global_scenario_checklist',
    'simulation_enabled',
    'public_contact_info'
  ) then raise exception 'Setting key is not editable through this RPC.'; end if;
  if jsonb_typeof(p_value) <> 'object' then raise exception 'Setting value must be a JSON object.'; end if;

  if p_key = 'first_reservation_deadline' then
    v_opens_at := nullif(p_value ->> 'opens_at', '')::timestamptz;
    v_deadline_at := nullif(p_value ->> 'deadline_at', '')::timestamptz;

    if v_opens_at is not null and v_deadline_at is not null and v_opens_at >= v_deadline_at then
      raise exception 'Reservation opening time must be before the deadline.';
    end if;

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
  elsif p_key = 'public_contact_info'
    and (
      jsonb_typeof(p_value -> 'email') <> 'string'
      or jsonb_typeof(p_value -> 'phone') <> 'string'
      or length(p_value ->> 'email') > 254
      or length(p_value ->> 'phone') > 50
    ) then
    raise exception 'Invalid public contact info.';
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
