-- =========================================================
-- Allow global admins to save/create personal reservations for any user
-- =========================================================

create or replace function public.save_user_reservation_as_admin(
  p_target_user_id uuid,
  p_name text,
  p_phone text,
  p_district text,
  p_team text,
  p_campus text,
  p_station_preferences jsonb,
  p_data jsonb,
  p_reason text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_district_id uuid := null;
  v_team_id uuid := null;
  v_campus_id uuid := null;
  v_affiliation_type text :=
    case when p_data ->> 'affiliationType' = 'external' then 'external' else 'seoul' end;
  v_coordinator_name text := nullif(trim(p_data ->> 'coordinatorName'), '');
  v_coordinator_phone text :=
    nullif(
      regexp_replace(coalesce(p_data ->> 'coordinatorPhone', ''), '[^0-9]', '', 'g'),
      ''
    );
  v_data jsonb;
  v_reservation_id uuid;
begin
  if not public.is_global_admin() then
    raise exception 'Only global admins can save reservations for other users.';
  end if;

  if nullif(trim(p_name), '') is null
    or nullif(trim(p_phone), '') is null
    or nullif(trim(p_district), '') is null
    or nullif(trim(p_campus), '') is null
    or (v_affiliation_type = 'seoul' and nullif(trim(p_team), '') is null) then
    raise exception 'Reservation fields are required.';
  end if;

  if jsonb_typeof(coalesce(p_station_preferences, 'null'::jsonb)) <> 'array' then
    raise exception 'Station preferences must be a JSON array.';
  end if;

  if jsonb_array_length(p_station_preferences) <> 2
    or p_station_preferences -> 0 ->> 'rank' <> '1'
    or p_station_preferences -> 1 ->> 'rank' <> '2' then
    raise exception 'Station preferences must have exactly rank 1 and rank 2.';
  end if;

  if nullif(btrim(p_reason), '') is null then
    raise exception 'A reason is required.';
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
    'coordinatorName', v_coordinator_name,
    'coordinatorPhone', v_coordinator_phone,
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
    affiliation_type,
    coordinator_name,
    coordinator_phone,
    station_preferences,
    status,
    confirmed_ticket,
    data,
    created_at,
    updated_at
  )
  values (
    p_target_user_id,
    trim(p_name),
    trim(p_phone),
    v_district_id,
    trim(p_district),
    v_team_id,
    case when v_affiliation_type = 'external' then '' else trim(p_team) end,
    v_campus_id,
    trim(p_campus),
    v_affiliation_type,
    v_coordinator_name,
    v_coordinator_phone,
    p_station_preferences,
    'requested',
    null,
    v_data,
    v_now,
    v_now
  )
  on conflict (user_id) do update set
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
    data = excluded.data,
    updated_at = v_now
  returning id into v_reservation_id;

  -- Create a payment record as pending
  insert into public.payments (user_id, reservation_id, amount, status, notes)
  values (p_target_user_id, v_reservation_id, 0, 'pending', p_reason)
  on conflict (reservation_id) do nothing;

  -- Log action
  insert into public.personal_user_action_logs (
    target_user_id, reservation_id, actor_id, action, reason,
    before_data, after_data, reversible
  )
  values (
    p_target_user_id, v_reservation_id, auth.uid(),
    'reservation_created_by_admin', btrim(p_reason),
    null,
    jsonb_build_object(
      'reservationStatus', 'requested',
        'name', p_name,
        'phone', p_phone,
        'district', p_district,
        'team', case when v_affiliation_type = 'external' then '' else p_team end,
        'campus', p_campus,
        'affiliationType', v_affiliation_type
      ),
      false
  );
end;
$$;

revoke all on function public.save_user_reservation_as_admin(uuid, text, text, text, text, text, jsonb, jsonb, text) from public, anon;
grant execute on function public.save_user_reservation_as_admin(uuid, text, text, text, text, text, jsonb, jsonb, text) to authenticated;
