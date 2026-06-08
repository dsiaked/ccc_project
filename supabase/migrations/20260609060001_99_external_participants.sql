-- =========================================================
-- External district participants
-- - Seoul participants keep using the registered organization hierarchy.
-- - External participants enter district/campus text without a team.
-- - External participant payments can only be managed by global admins.
-- =========================================================

alter table public.profiles
  add column if not exists affiliation_type text not null default 'seoul',
  add column if not exists coordinator_name text,
  add column if not exists coordinator_phone text;

alter table public.profiles
  drop constraint if exists profiles_affiliation_type_check;

alter table public.profiles
  add constraint profiles_affiliation_type_check
  check (affiliation_type in ('seoul', 'external'));

alter table public.reservations
  add column if not exists affiliation_type text not null default 'seoul',
  add column if not exists coordinator_name text,
  add column if not exists coordinator_phone text;

alter table public.reservations
  drop constraint if exists reservations_affiliation_type_check;

alter table public.reservations
  add constraint reservations_affiliation_type_check
  check (affiliation_type in ('seoul', 'external'));

create index if not exists idx_profiles_affiliation_type
  on public.profiles(affiliation_type);

create index if not exists idx_reservations_affiliation_type
  on public.reservations(affiliation_type);

create or replace function public.prevent_locked_affiliation_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (
    old.district_id is distinct from new.district_id
    or old.district is distinct from new.district
    or old.team_id is distinct from new.team_id
    or old.team is distinct from new.team
    or old.campus_id is distinct from new.campus_id
    or old.campus is distinct from new.campus
    or old.affiliation_type is distinct from new.affiliation_type
    or old.coordinator_name is distinct from new.coordinator_name
    or old.coordinator_phone is distinct from new.coordinator_phone
  )
  and exists (
    select 1 from public.reservations reservation
    where reservation.user_id = old.id
      and reservation.status = 'confirmed'
  )
  and not public.is_global_admin() then
    raise exception 'Confirmed participant affiliation can only be changed by a global admin.';
  end if;

  return new;
end;
$$;

drop trigger if exists prevent_locked_affiliation_change on public.profiles;
create trigger prevent_locked_affiliation_change
before update on public.profiles
for each row execute function public.prevent_locked_affiliation_change();

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_affiliation_type text :=
    case
      when new.raw_user_meta_data ->> 'affiliation_type' = 'external'
        then 'external'
      else 'seoul'
    end;
begin
  insert into public.profiles (
    id, email, name, phone,
    district_id, district, team_id, team, campus_id, campus,
    affiliation_type, coordinator_name, coordinator_phone,
    account_source, updated_at
  )
  values (
    new.id,
    lower(new.email),
    new.raw_user_meta_data ->> 'name',
    new.raw_user_meta_data ->> 'phone',
    case when v_affiliation_type = 'seoul'
      then nullif(new.raw_user_meta_data ->> 'district_id', '')::uuid end,
    new.raw_user_meta_data ->> 'district',
    case when v_affiliation_type = 'seoul'
      then nullif(new.raw_user_meta_data ->> 'team_id', '')::uuid end,
    case when v_affiliation_type = 'seoul'
      then new.raw_user_meta_data ->> 'team' else '' end,
    case when v_affiliation_type = 'seoul'
      then nullif(new.raw_user_meta_data ->> 'campus_id', '')::uuid end,
    new.raw_user_meta_data ->> 'campus',
    v_affiliation_type,
    case when v_affiliation_type = 'external'
      then new.raw_user_meta_data ->> 'coordinator_name' end,
    case when v_affiliation_type = 'external'
      then new.raw_user_meta_data ->> 'coordinator_phone' end,
    case
      when new.raw_user_meta_data ->> 'account_source' = 'admin_created'
        then 'admin_created'
      else 'self_signup'
    end,
    now()
  )
  on conflict (id) do update
  set
    email = excluded.email,
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
    account_source = excluded.account_source,
    updated_at = now();

  return new;
end;
$$;

drop function if exists public.save_user_reservation(
  text, text, text, text, text, jsonb, jsonb
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
  v_affiliation_type text :=
    case when p_data ->> 'affiliationType' = 'external' then 'external' else 'seoul' end;
  v_coordinator_name text := nullif(trim(p_data ->> 'coordinatorName'), '');
  v_coordinator_phone text := nullif(trim(p_data ->> 'coordinatorPhone'), '');
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
      v_coordinator_name is null or v_coordinator_phone is null
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
    'coordinatorName', v_coordinator_name,
    'coordinatorPhone', v_coordinator_phone,
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
    v_affiliation_type, v_coordinator_name, v_coordinator_phone,
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
    coordinator_name = v_coordinator_name,
    coordinator_phone = v_coordinator_phone,
    updated_at = v_now
  where id = v_user_id;

  return v_reservation_id;
end;
$$;

revoke all on function public.save_user_reservation(
  text, text, text, text, text, jsonb, jsonb
) from public, anon;

grant execute on function public.save_user_reservation(
  text, text, text, text, text, jsonb, jsonb
) to authenticated;

create or replace function public.enforce_external_payment_global_admin()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (
    select 1
    from public.reservations reservation
    where reservation.id = new.reservation_id
      and reservation.affiliation_type = 'external'
  ) and not public.is_global_admin() then
    raise exception 'Only global admins can manage external participant payments.';
  end if;

  return new;
end;
$$;

drop trigger if exists enforce_external_payment_global_admin on public.payments;
create trigger enforce_external_payment_global_admin
before insert or update on public.payments
for each row execute function public.enforce_external_payment_global_admin();

notify pgrst, 'reload schema';
