-- The deployed app calls public.save_user_reservation directly. Some
-- production databases still had an older full implementation there, so route
-- it through the external-aware implementation while preserving opening checks.

create or replace function public.save_user_reservation(
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
) to authenticated, service_role;

create or replace function public.get_deployment_compatibility_version()
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select 231;
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
  v_deployed_version constant integer := 231;
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
