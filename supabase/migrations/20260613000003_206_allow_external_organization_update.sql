-- 1. Ensure unique index on reservations(user_id) exists
-- Clean up any duplicate reservations first (keeping the latest updated one)
delete from public.reservations a using public.reservations b
where a.updated_at < b.updated_at and a.user_id = b.user_id;

-- Also in case updated_at is identical, clean by id
delete from public.reservations a using public.reservations b
where a.id < b.id and a.user_id = b.user_id;

create unique index if not exists idx_reservations_user_unique
  on public.reservations(user_id);

-- 2. Define/update save_user_reservation_as_admin to support both Seoul and external participants,
-- and use select-then-upsert to be 100% robust against missing constraints.
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
  v_coordinator_phone text := regexp_replace(coalesce(p_data ->> 'coordinatorPhone', ''), '[^0-9]', '', 'g');
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
    'coordinatorName', case when v_affiliation_type = 'external' then v_coordinator_name else null end,
    'coordinatorPhone', case when v_affiliation_type = 'external' then nullif(v_coordinator_phone, '') else null end,
    'stationPreferences', p_station_preferences,
    'status', 'requested',
    'confirmedTicket', null,
    'requestedAt', v_now::text
  );

  select id into v_reservation_id
  from public.reservations
  where user_id = p_target_user_id;

  if v_reservation_id is not null then
    update public.reservations set
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
      station_preferences = p_station_preferences,
      status = 'requested',
      data = v_data,
      updated_at = v_now
    where id = v_reservation_id;
  else
    insert into public.reservations (
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
      case when v_affiliation_type = 'external' then v_coordinator_name else null end,
      case when v_affiliation_type = 'external' then nullif(v_coordinator_phone, '') else null end,
      p_station_preferences,
      'requested',
      null,
      v_data,
      v_now,
      v_now
    )
    returning id into v_reservation_id;
  end if;

  -- Create a payment record as pending if it does not exist
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
      'team', p_team,
      'campus', p_campus,
      'affiliationType', v_affiliation_type
    ),
    false
  );

  return v_reservation_id;
end;
$$;

revoke all on function public.save_user_reservation_as_admin(uuid, text, text, text, text, text, jsonb, jsonb, text) from public, anon;
grant execute on function public.save_user_reservation_as_admin(uuid, text, text, text, text, text, jsonb, jsonb, text) to authenticated;

-- 3. Define organization update RPC version 2 supporting external users
create or replace function public.update_personal_user_organization_v2(
  p_target_user_id uuid,
  p_reservation_id uuid,
  p_affiliation_type text, -- 'seoul' or 'external'
  p_campus_id uuid,        -- nullable for external
  p_district text,         -- nullable for seoul
  p_campus text,           -- nullable for seoul
  p_coordinator_name text, -- nullable for seoul
  p_coordinator_phone text, -- nullable for seoul
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_before jsonb;
  v_phone text := regexp_replace(coalesce(p_coordinator_phone, ''), '[^0-9]', '', 'g');
begin
  if not public.is_global_admin() then raise exception 'Only global admins can update personal user organization.'; end if;
  if nullif(btrim(p_reason), '') is null then raise exception 'A reason is required.'; end if;
  
  if p_affiliation_type not in ('seoul', 'external') then
    raise exception 'Invalid affiliation type.';
  end if;

  select to_jsonb(profile) into v_before from public.profiles profile where id = p_target_user_id for update;

  if p_affiliation_type = 'seoul' then
    if p_campus_id is null then raise exception 'Campus ID is required for Seoul affiliation.'; end if;
    update public.profiles
    set affiliation_type = 'seoul',
        campus_id = p_campus_id,
        coordinator_name = null,
        coordinator_phone = null,
        updated_at = clock_timestamp()
    where id = p_target_user_id;

    if p_reservation_id is not null then
      update public.reservations
      set affiliation_type = 'seoul',
          campus_id = p_campus_id,
          coordinator_name = null,
          coordinator_phone = null,
          updated_at = clock_timestamp()
      where id = p_reservation_id and user_id = p_target_user_id;
    end if;
  else
    if nullif(trim(p_district), '') is null or nullif(trim(p_campus), '') is null then
      raise exception 'District and campus are required for external affiliation.';
    end if;
    update public.profiles
    set affiliation_type = 'external',
        campus_id = null,
        district_id = null,
        team_id = null,
        district = trim(p_district),
        team = '',
        campus = trim(p_campus),
        coordinator_name = nullif(trim(p_coordinator_name), ''),
        coordinator_phone = nullif(v_phone, ''),
        updated_at = clock_timestamp()
    where id = p_target_user_id;

    if p_reservation_id is not null then
      update public.reservations
      set affiliation_type = 'external',
          campus_id = null,
          district_id = null,
          team_id = null,
          district = trim(p_district),
          team = '',
          campus = trim(p_campus),
          coordinator_name = nullif(trim(p_coordinator_name), ''),
          coordinator_phone = nullif(v_phone, ''),
          updated_at = clock_timestamp()
      where id = p_reservation_id and user_id = p_target_user_id;
    end if;
  end if;

  insert into public.personal_user_action_logs (
    target_user_id, reservation_id, actor_id, action, reason, before_data, after_data, reversible
  )
  select p_target_user_id, p_reservation_id, auth.uid(), 'organization_updated', btrim(p_reason),
    jsonb_build_object('district', v_before ->> 'district', 'team', v_before ->> 'team', 'campus', v_before ->> 'campus', 'campusId', v_before ->> 'campus_id', 'affiliationType', v_before ->> 'affiliation_type'),
    jsonb_build_object('district', profile.district, 'team', profile.team, 'campus', profile.campus, 'campusId', profile.campus_id, 'affiliationType', profile.affiliation_type),
    true
  from public.profiles profile where profile.id = p_target_user_id;
end;
$$;

revoke all on function public.update_personal_user_organization_v2(uuid, uuid, text, uuid, text, text, text, text, text) from public, anon;
grant execute on function public.update_personal_user_organization_v2(uuid, uuid, text, uuid, text, text, text, text, text) to authenticated;
