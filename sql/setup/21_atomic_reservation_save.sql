-- =========================================================
-- Atomic user reservation save
-- Run after 20_reservation_deadline.sql.
-- =========================================================

-- User reservation writes must go through the validated RPCs below.
drop policy if exists "Users can insert own reservations" on public.reservations;
drop policy if exists "Users can update own reservations" on public.reservations;
drop policy if exists "Users can delete own reservations" on public.reservations;
drop policy if exists "Global admins can update reservations" on public.reservations;

revoke insert, update, delete on table public.reservations from public, anon, authenticated;

update public.reservations
set
  station_preferences = jsonb_path_query_array(
    station_preferences,
    '$[*] ? (@.rank == 1 || @.rank == 2)'
  ),
  data = jsonb_set(
    coalesce(data, '{}'::jsonb),
    '{stationPreferences}',
    jsonb_path_query_array(
      station_preferences,
      '$[*] ? (@.rank == 1 || @.rank == 2)'
    ),
    true
  ),
  updated_at = now()
where station_preferences is distinct from jsonb_path_query_array(
  station_preferences,
  '$[*] ? (@.rank == 1 || @.rank == 2)'
);

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
  v_user_id uuid := auth.uid();
  v_now timestamptz;
  v_deadline_value jsonb;
  v_deadline_at timestamptz;
  v_district_id uuid;
  v_team_id uuid;
  v_campus_id uuid;
  v_data jsonb;
  v_reservation_id uuid;
begin
  if v_user_id is null then
    raise exception 'Authentication failed.';
  end if;

  if nullif(trim(p_name), '') is null
    or nullif(trim(p_phone), '') is null
    or nullif(trim(p_district), '') is null
    or nullif(trim(p_team), '') is null
    or nullif(trim(p_campus), '') is null then
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
          (
            stations.id::text = p_station_preferences -> 0 -> 'station' ->> 'id'
            and stations.name = p_station_preferences -> 0 -> 'station' ->> 'name'
          )
          or (
            stations.id::text = p_station_preferences -> 1 -> 'station' ->> 'id'
            and stations.name = p_station_preferences -> 1 -> 'station' ->> 'name'
          )
        )
    ) <> 2 then
    raise exception 'Station preferences contain invalid or duplicate stations.';
  end if;

  if jsonb_typeof(coalesce(p_data, 'null'::jsonb)) <> 'object' then
    raise exception 'Reservation data must be a JSON object.';
  end if;

  -- Serialize deadline changes with reservation writes.
  select value
  into v_deadline_value
  from public.app_settings
  where key = 'first_reservation_deadline'
  for share;

  if v_deadline_value is null then
    raise exception 'Reservation deadline setting is missing.';
  end if;

  v_now := clock_timestamp();
  v_deadline_at :=
    nullif(v_deadline_value ->> 'deadline_at', '')::timestamptz;

  if v_deadline_at is not null and v_deadline_at <= v_now then
    raise exception 'Reservation deadline has passed.';
  end if;

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

  v_data := p_data || jsonb_build_object(
    'name', trim(p_name),
    'phone', trim(p_phone),
    'district', trim(p_district),
    'team', trim(p_team),
    'campus', trim(p_campus),
    'stationPreferences', p_station_preferences,
    'status', 'requested',
    'confirmedTicket', null,
    'requestedAt', v_now::text
  );

  insert into public.reservations as target (
    user_id,
    name,
    phone,
    district_id,
    district,
    team_id,
    team,
    campus_id,
    campus,
    station_preferences,
    status,
    confirmed_ticket,
    data,
    created_at,
    updated_at
  )
  values (
    v_user_id,
    trim(p_name),
    trim(p_phone),
    v_district_id,
    trim(p_district),
    v_team_id,
    trim(p_team),
    v_campus_id,
    trim(p_campus),
    p_station_preferences,
    'requested',
    null,
    v_data,
    v_now,
    v_now
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
    station_preferences = excluded.station_preferences,
    status = 'requested',
    confirmed_ticket = null,
    data = jsonb_set(
      jsonb_set(
        excluded.data,
        '{requestedAt}',
        case
          when target.status = 'cancelled' then to_jsonb(v_now::text)
          else coalesce(
            target.data -> 'requestedAt',
            to_jsonb(target.created_at::text)
          )
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

  return v_reservation_id;
end;
$$;

revoke all on function public.save_user_reservation(
  text, text, text, text, text, jsonb, jsonb
) from public, anon;

grant execute on function public.save_user_reservation(
  text, text, text, text, text, jsonb, jsonb
) to authenticated;

create or replace function public.delete_user_reservation()
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_deadline_value jsonb;
  v_deadline_at timestamptz;
  v_status text;
begin
  if v_user_id is null then
    raise exception 'Authentication failed.';
  end if;

  select value
  into v_deadline_value
  from public.app_settings
  where key = 'first_reservation_deadline'
  for share;

  if v_deadline_value is null then
    raise exception 'Reservation deadline setting is missing.';
  end if;

  v_deadline_at :=
    nullif(v_deadline_value ->> 'deadline_at', '')::timestamptz;

  if v_deadline_at is not null and v_deadline_at <= clock_timestamp() then
    raise exception 'Reservation deadline has passed.';
  end if;

  select status
  into v_status
  from public.reservations
  where user_id = v_user_id
  for update;

  if not found then
    return false;
  end if;

  if v_status <> 'requested' then
    raise exception 'Only requested reservations can be deleted.';
  end if;

  delete from public.reservations
  where user_id = v_user_id
    and status = 'requested';

  return found;
end;
$$;

revoke all on function public.delete_user_reservation() from public, anon;
grant execute on function public.delete_user_reservation() to authenticated;

notify pgrst, 'reload schema';
