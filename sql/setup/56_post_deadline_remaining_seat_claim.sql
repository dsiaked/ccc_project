-- =========================================================
-- Post-deadline remaining seat selection for users
-- Run after 55_atomic_allocation_confirmation.sql.
-- =========================================================

create or replace function public.get_available_remaining_seats()
returns table (
  allocation_id uuid,
  allocation_name text,
  bus_id text,
  bus_label text,
  destination text,
  departure_time text,
  boarding_place text,
  capacity integer,
  remaining_seats integer
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_actor_id uuid := auth.uid();
  v_deadline_at timestamptz;
begin
  if v_actor_id is null then
    raise exception 'Authentication is required.';
  end if;

  select nullif(value ->> 'deadline_at', '')::timestamptz
  into v_deadline_at
  from public.app_settings
  where key = 'first_reservation_deadline';

  if v_deadline_at is null or v_deadline_at > clock_timestamp() then
    return;
  end if;

  if exists (
    select 1
    from public.reservations
    where user_id = v_actor_id
  ) then
    return;
  end if;

  return query
  select
    allocation.id,
    allocation.allocation_name,
    bus ->> 'id',
    bus ->> 'label',
    bus ->> 'destination',
    bus ->> 'departureTime',
    bus ->> 'boardingPlace',
    (bus ->> 'capacity')::integer,
    (bus ->> 'capacity')::integer - (
      select count(*)::integer
      from jsonb_array_elements(
        coalesce(allocation.allocation_data -> 'passengers', '[]'::jsonb)
      ) passenger
      where passenger ->> 'busId' = bus ->> 'id'
    )
  from public.bus_allocations allocation
  cross join lateral jsonb_array_elements(
    coalesce(allocation.allocation_data -> 'buses', '[]'::jsonb)
  ) bus
  where allocation.allocation_data ->> 'status' = 'confirmed'
    and coalesce(bus ->> 'capacity', '') ~ '^[1-9][0-9]*$'
    and nullif(btrim(bus ->> 'id'), '') is not null
    and nullif(btrim(bus ->> 'label'), '') is not null
    and nullif(btrim(bus ->> 'destination'), '') is not null
    and nullif(btrim(bus ->> 'departureTime'), '') is not null
    and nullif(btrim(bus ->> 'boardingPlace'), '') is not null
    and (bus ->> 'capacity')::integer > (
      select count(*)::integer
      from jsonb_array_elements(
        coalesce(allocation.allocation_data -> 'passengers', '[]'::jsonb)
      ) passenger
      where passenger ->> 'busId' = bus ->> 'id'
    )
  order by bus ->> 'destination', bus ->> 'label';
end;
$$;

create or replace function public.claim_remaining_seat(
  p_allocation_id uuid,
  p_bus_id text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id uuid := auth.uid();
  v_now timestamptz := clock_timestamp();
  v_deadline_at timestamptz;
  v_allocation_data jsonb;
  v_bus jsonb;
  v_capacity integer;
  v_seat_number integer;
  v_reservation_id uuid := gen_random_uuid();
  v_profile record;
  v_ticket jsonb;
  v_reservation_data jsonb;
  v_passenger jsonb;
  v_history_item jsonb;
begin
  if v_actor_id is null then
    raise exception 'Authentication is required.';
  end if;

  select nullif(value ->> 'deadline_at', '')::timestamptz
  into v_deadline_at
  from public.app_settings
  where key = 'first_reservation_deadline';

  if v_deadline_at is null or v_deadline_at > v_now then
    raise exception 'Remaining seats are available only after the deadline.';
  end if;

  lock table public.bus_allocations in share row exclusive mode;
  lock table public.reservations in share row exclusive mode;

  if exists (
    select 1
    from public.reservations
    where user_id = v_actor_id
  ) then
    raise exception 'A reservation already exists for this user.';
  end if;

  select allocation_data
  into v_allocation_data
  from public.bus_allocations
  where id = p_allocation_id
    and allocation_data ->> 'status' = 'confirmed'
  for update;

  if v_allocation_data is null then
    raise exception 'The confirmed allocation is no longer available.';
  end if;

  select bus
  into v_bus
  from jsonb_array_elements(
    coalesce(v_allocation_data -> 'buses', '[]'::jsonb)
  ) bus
  where bus ->> 'id' = p_bus_id
  limit 1;

  if v_bus is null
    or coalesce(v_bus ->> 'capacity', '') !~ '^[1-9][0-9]*$'
    or nullif(btrim(v_bus ->> 'label'), '') is null
    or nullif(btrim(v_bus ->> 'destination'), '') is null
    or nullif(btrim(v_bus ->> 'departureTime'), '') is null
    or nullif(btrim(v_bus ->> 'boardingPlace'), '') is null then
    raise exception 'The selected bus is not available.';
  end if;

  v_capacity := (v_bus ->> 'capacity')::integer;

  select candidate
  into v_seat_number
  from generate_series(1, v_capacity) candidate
  where not exists (
    select 1
    from jsonb_array_elements(
      coalesce(v_allocation_data -> 'passengers', '[]'::jsonb)
    ) passenger
    where passenger ->> 'busId' = p_bus_id
      and passenger ->> 'seatNumber' = candidate::text
  )
  order by candidate
  limit 1;

  if v_seat_number is null then
    raise exception 'No remaining seats are available on this bus.';
  end if;

  select
    name,
    phone,
    district_id,
    district,
    team_id,
    team,
    campus_id,
    campus
  into v_profile
  from public.profiles
  where id = v_actor_id;

  if not found then
    raise exception 'Complete your profile before selecting a remaining seat.';
  end if;

  if nullif(btrim(v_profile.name), '') is null
    or nullif(btrim(v_profile.phone), '') is null
    or nullif(btrim(v_profile.team), '') is null
    or nullif(btrim(v_profile.campus), '') is null then
    raise exception 'Complete your profile before selecting a remaining seat.';
  end if;

  v_ticket := jsonb_build_object(
    'busNumber', v_bus ->> 'label',
    'seatNumber', v_seat_number::text,
    'departureTime', v_bus ->> 'departureTime',
    'boardingPlace', v_bus ->> 'boardingPlace',
    'dropoffStation', v_bus ->> 'destination',
    'managerNote', '마감 후 잔여 좌석 직접 신청',
    'confirmedAt', v_now::text
  );

  v_reservation_data := jsonb_build_object(
    'id', v_reservation_id::text,
    'name', v_profile.name,
    'phone', v_profile.phone,
    'district', coalesce(v_profile.district, ''),
    'team', v_profile.team,
    'campus', v_profile.campus,
    'stationPreferences', '[]'::jsonb,
    'status', 'confirmed',
    'confirmedTicket', v_ticket,
    'requestedAt', v_now::text
  );

  insert into public.reservations (
    id,
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
    v_reservation_id,
    v_actor_id,
    v_profile.name,
    v_profile.phone,
    v_profile.district_id,
    coalesce(v_profile.district, ''),
    v_profile.team_id,
    v_profile.team,
    v_profile.campus_id,
    v_profile.campus,
    '[]'::jsonb,
    'confirmed',
    v_ticket,
    v_reservation_data,
    v_now,
    v_now
  );

  v_passenger := jsonb_build_object(
    'reservationId', v_reservation_id::text,
    'name', v_profile.name,
    'campus', v_profile.campus,
    'team', v_profile.team,
    'preferences', jsonb_build_array(
      v_bus ->> 'destination',
      v_bus ->> 'destination'
    ),
    'busId', p_bus_id,
    'seatNumber', v_seat_number
  );
  v_history_item := jsonb_build_object(
    'id', 'remaining-seat-' || gen_random_uuid()::text,
    'at', v_now::text,
    'actorId', v_actor_id::text,
    'action', 'remaining_seat_claimed',
    'detail', v_profile.name || ': ' || (v_bus ->> 'label') || ' '
      || v_seat_number || '번 잔여 좌석 직접 신청'
  );

  update public.bus_allocations
  set allocation_data = jsonb_set(
    jsonb_set(
      v_allocation_data,
      '{passengers}',
      coalesce(v_allocation_data -> 'passengers', '[]'::jsonb)
        || jsonb_build_array(v_passenger),
      true
    ),
    '{history}',
    coalesce(v_allocation_data -> 'history', '[]'::jsonb)
      || jsonb_build_array(v_history_item),
    true
  )
  where id = p_allocation_id;

  return v_ticket;
end;
$$;

revoke all on function public.get_available_remaining_seats() from public;
grant execute on function public.get_available_remaining_seats() to authenticated;

revoke all on function public.claim_remaining_seat(uuid, text) from public;
grant execute on function public.claim_remaining_seat(uuid, text) to authenticated;

notify pgrst, 'reload schema';
