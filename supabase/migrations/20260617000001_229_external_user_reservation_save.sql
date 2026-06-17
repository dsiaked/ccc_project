-- Allow regular external-district users to save reservations from the public form.
-- Production had the external-affiliation frontend deployed while its public
-- reservation save RPC still required a Seoul team/campus scope.

create or replace function public.save_user_reservation_without_opening_check(
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
  v_user_id uuid := auth.uid();
  v_now timestamptz;
  v_deadline_value jsonb;
  v_deadline_at timestamptz;
  v_district_id uuid := null;
  v_team_id uuid := null;
  v_campus_id uuid := null;
  v_affiliation_type text :=
    case when p_data ->> 'affiliationType' = 'external' then 'external' else 'seoul' end;
  v_coordinator_name text := nullif(trim(p_data ->> 'coordinatorName'), '');
  v_coordinator_phone text := regexp_replace(coalesce(p_data ->> 'coordinatorPhone', ''), '[^0-9]', '', 'g');
  v_data jsonb;
  v_reservation_id uuid;
begin
  if v_user_id is null then
    raise exception 'Authentication failed.';
  end if;

  if nullif(trim(p_name), '') is null
    or nullif(trim(p_phone), '') is null
    or nullif(trim(p_district), '') is null
    or nullif(trim(p_campus), '') is null
    or (v_affiliation_type = 'seoul' and nullif(trim(p_team), '') is null)
    or (v_affiliation_type = 'external' and (
      v_coordinator_name is null or nullif(v_coordinator_phone, '') is null
    )) then
    raise exception 'Reservation fields are required.';
  end if;

  if jsonb_typeof(coalesce(p_station_preferences, 'null'::jsonb)) <> 'array' then
    raise exception 'Station preferences must be a JSON array.';
  end if;

  if jsonb_array_length(p_station_preferences) <> 2
    or p_station_preferences -> 0 ->> 'rank' <> '1'
    or p_station_preferences -> 1 ->> 'rank' <> '2' then
    raise exception 'Station preferences must contain first and second choices.';
  end if;

  if nullif(p_station_preferences -> 0 -> 'station' ->> 'id', '') is null
    or nullif(p_station_preferences -> 1 -> 'station' ->> 'id', '') is null
    or p_station_preferences -> 0 -> 'station' ->> 'id'
      = p_station_preferences -> 1 -> 'station' ->> 'id'
    or (
      select count(*)
      from public.stations
      where stations.is_active = true
        and (
          (stations.id::text = p_station_preferences -> 0 -> 'station' ->> 'id'
            and stations.name = p_station_preferences -> 0 -> 'station' ->> 'name')
          or
          (stations.id::text = p_station_preferences -> 1 -> 'station' ->> 'id'
            and stations.name = p_station_preferences -> 1 -> 'station' ->> 'name')
        )
    ) <> 2 then
    raise exception 'Station preferences contain invalid or duplicate stations.';
  end if;

  if jsonb_typeof(coalesce(p_data, 'null'::jsonb)) <> 'object' then
    raise exception 'Reservation data must be a JSON object.';
  end if;

  select value into v_deadline_value
  from public.app_settings
  where key = 'first_reservation_deadline'
  for share;

  if v_deadline_value is null then
    raise exception 'Reservation deadline setting is missing.';
  end if;

  v_now := clock_timestamp();
  v_deadline_at := nullif(v_deadline_value ->> 'deadline_at', '')::timestamptz;

  if v_deadline_at is not null and v_deadline_at <= v_now then
    raise exception 'Reservation deadline has passed.';
  end if;

  if v_affiliation_type = 'seoul' then
    select district_id, team_id, campus_id
    into v_district_id, v_team_id, v_campus_id
    from public.campus_options
    where district = trim(p_district)
      and team = trim(p_team)
      and campus = trim(p_campus)
    limit 1;

    if v_campus_id is null then
      raise exception 'Invalid reservation organization scope.';
    end if;
  end if;

  v_data := p_data || jsonb_build_object(
    'name', trim(p_name),
    'phone', trim(p_phone),
    'district', trim(p_district),
    'team', case when v_affiliation_type = 'external' then '' else trim(p_team) end,
    'campus', trim(p_campus),
    'affiliationType', v_affiliation_type,
    'coordinatorName', case when v_affiliation_type = 'external' then v_coordinator_name else null end,
    'coordinatorPhone', case when v_affiliation_type = 'external' then nullif(v_coordinator_phone, '') else null end,
    'stationPreferences', p_station_preferences,
    'status', 'requested',
    'confirmedTicket', null,
    'requestedAt', v_now::text
  );

  insert into public.reservations as target (
    user_id, name, phone,
    district_id, district, team_id, team, campus_id, campus,
    affiliation_type, coordinator_name, coordinator_phone,
    station_preferences, status, confirmed_ticket, data, created_at, updated_at
  )
  values (
    v_user_id, trim(p_name), trim(p_phone),
    v_district_id, trim(p_district), v_team_id,
    case when v_affiliation_type = 'external' then '' else trim(p_team) end,
    v_campus_id, trim(p_campus),
    v_affiliation_type,
    case when v_affiliation_type = 'external' then v_coordinator_name else null end,
    case when v_affiliation_type = 'external' then nullif(v_coordinator_phone, '') else null end,
    p_station_preferences, 'requested', null, v_data, v_now, v_now
  )
  on conflict (user_id)
  do update set
    name = excluded.name,
    phone = excluded.phone,
    district_id = excluded.district_id,
    district = excluded.district,
    team_id = excluded.team_id,
    team = excluded.team,
    campus_id = excluded.campus_id,
    campus = excluded.campus,
    affiliation_type = excluded.affiliation_type,
    coordinator_name = excluded.coordinator_name,
    coordinator_phone = excluded.coordinator_phone,
    station_preferences = excluded.station_preferences,
    status = 'requested',
    confirmed_ticket = null,
    data = jsonb_set(
      jsonb_set(
        excluded.data,
        '{requestedAt}',
        case
          when target.status = 'cancelled' then to_jsonb(v_now::text)
          else coalesce(target.data -> 'requestedAt', to_jsonb(target.created_at::text))
        end,
        true
      ),
      '{updatedAt}',
      to_jsonb(v_now::text),
      true
    ),
    updated_at = v_now
  where target.status in ('requested', 'cancelled')
  returning id into v_reservation_id;

  if v_reservation_id is null then
    raise exception 'Confirmed reservations cannot be changed.';
  end if;

  update public.profiles
  set
    name = trim(p_name),
    phone = trim(p_phone),
    district_id = v_district_id,
    district = trim(p_district),
    team_id = v_team_id,
    team = case when v_affiliation_type = 'external' then '' else trim(p_team) end,
    campus_id = v_campus_id,
    campus = trim(p_campus),
    affiliation_type = v_affiliation_type,
    coordinator_name = case when v_affiliation_type = 'external' then v_coordinator_name else null end,
    coordinator_phone = case when v_affiliation_type = 'external' then nullif(v_coordinator_phone, '') else null end,
    updated_at = v_now
  where id = v_user_id;

  return v_reservation_id;
end;
$$;

revoke all on function public.save_user_reservation_without_opening_check(
  text, text, text, text, text, jsonb, jsonb
) from public, anon, authenticated;
grant execute on function public.save_user_reservation_without_opening_check(
  text, text, text, text, text, jsonb, jsonb
) to service_role;

notify pgrst, 'reload schema';
