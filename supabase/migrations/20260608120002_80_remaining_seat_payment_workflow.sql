-- =========================================================
-- Remaining-seat payment workflow
-- - Users temporarily hold an automatically assigned seat.
-- - Only a global administrator can confirm payment and issue the ticket.
-- - Users and global administrators can cancel a pending hold.
-- =========================================================

insert into public.app_settings (key, value)
values ('remaining_seat_sales', '{"enabled": true, "hidden_bus_ids": []}'::jsonb)
on conflict (key) do nothing;

drop function if exists public.get_available_remaining_seats();
drop function if exists public.claim_remaining_seat(uuid, text);
drop function if exists public.sell_remaining_seat_as_admin(
  uuid, uuid, text, text, text, text, text
);

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
  remaining_seats integer,
  price integer,
  transfer_account text
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_actor_id uuid := auth.uid();
  v_deadline_at timestamptz;
  v_sales_setting jsonb := '{"enabled": true, "hidden_bus_ids": []}'::jsonb;
  v_price integer := 0;
  v_transfer_account text := '';
begin
  if v_actor_id is null then
    raise exception 'Authentication is required.';
  end if;

  select nullif(value ->> 'deadline_at', '')::timestamptz
  into v_deadline_at
  from public.app_settings
  where key = 'first_reservation_deadline';

  select value into v_sales_setting
  from public.app_settings
  where key = 'remaining_seat_sales';

  select greatest(coalesce((value ->> 'price')::integer, 0), 0)
  into v_price
  from public.app_settings
  where key = 'bus_ticket_price';

  select coalesce(value ->> 'account_number', '')
  into v_transfer_account
  from public.app_settings
  where key = 'seoul_district_transfer_account';

  if v_deadline_at is null
    or v_deadline_at > clock_timestamp()
    or not coalesce((v_sales_setting ->> 'enabled')::boolean, true) then
    return;
  end if;

  if exists (
    select 1
    from public.reservations
    where user_id = v_actor_id
      and status <> 'cancelled'
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
      from jsonb_array_elements(coalesce(allocation.allocation_data -> 'passengers', '[]'::jsonb)) passenger
      where passenger ->> 'busId' = bus ->> 'id'
    ),
    v_price,
    v_transfer_account
  from public.bus_allocations allocation
  cross join lateral jsonb_array_elements(coalesce(allocation.allocation_data -> 'buses', '[]'::jsonb)) bus
  where allocation.allocation_data ->> 'status' = 'confirmed'
    and coalesce(bus ->> 'capacity', '') ~ '^[1-9][0-9]*$'
    and not (coalesce(v_sales_setting -> 'hidden_bus_ids', '[]'::jsonb) ? (bus ->> 'id'))
    and (bus ->> 'capacity')::integer > (
      select count(*)::integer
      from jsonb_array_elements(coalesce(allocation.allocation_data -> 'passengers', '[]'::jsonb)) passenger
      where passenger ->> 'busId' = bus ->> 'id'
    )
  order by bus ->> 'destination', bus ->> 'label';
end;
$$;

create or replace function public.claim_remaining_seat(
  p_allocation_id uuid,
  p_bus_id text,
  p_depositor_name text
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
  v_sales_setting jsonb := '{"enabled": true, "hidden_bus_ids": []}'::jsonb;
  v_allocation_name text;
  v_allocation_data jsonb;
  v_bus jsonb;
  v_capacity integer;
  v_seat_number integer;
  v_reservation_id uuid := gen_random_uuid();
  v_profile record;
  v_claim jsonb;
  v_reservation_data jsonb;
  v_passenger jsonb;
  v_price integer := 0;
  v_transfer_account text := '';
  v_existing_reservation_status text;
begin
  if v_actor_id is null then raise exception 'Authentication is required.'; end if;
  if nullif(btrim(p_depositor_name), '') is null then raise exception 'Depositor name is required.'; end if;

  select nullif(value ->> 'deadline_at', '')::timestamptz into v_deadline_at
  from public.app_settings where key = 'first_reservation_deadline';
  select value into v_sales_setting from public.app_settings where key = 'remaining_seat_sales';
  select greatest(coalesce((value ->> 'price')::integer, 0), 0) into v_price
  from public.app_settings where key = 'bus_ticket_price';
  select coalesce(value ->> 'account_number', '') into v_transfer_account
  from public.app_settings where key = 'seoul_district_transfer_account';

  if v_deadline_at is null or v_deadline_at > v_now then
    raise exception 'Remaining seats are available only after the deadline.';
  end if;
  if not coalesce((v_sales_setting ->> 'enabled')::boolean, true) then
    raise exception 'Remaining seat sales are closed.';
  end if;
  if coalesce(v_sales_setting -> 'hidden_bus_ids', '[]'::jsonb) ? p_bus_id then
    raise exception 'The selected bus is not open for remaining seat sales.';
  end if;

  lock table public.bus_allocations in share row exclusive mode;
  lock table public.reservations in share row exclusive mode;

  select id, status
  into v_reservation_id, v_existing_reservation_status
  from public.reservations
  where user_id = v_actor_id
  for update;

  if found and v_existing_reservation_status <> 'cancelled' then
    raise exception 'A reservation already exists for this user.';
  end if;
  if not found then
    v_reservation_id := gen_random_uuid();
  end if;

  select allocation_name, allocation_data into v_allocation_name, v_allocation_data
  from public.bus_allocations
  where id = p_allocation_id and allocation_data ->> 'status' = 'confirmed'
  for update;
  if v_allocation_data is null then raise exception 'The confirmed allocation is no longer available.'; end if;

  select bus into v_bus
  from jsonb_array_elements(coalesce(v_allocation_data -> 'buses', '[]'::jsonb)) bus
  where bus ->> 'id' = p_bus_id limit 1;
  if v_bus is null then raise exception 'The selected bus is not available.'; end if;

  v_capacity := (v_bus ->> 'capacity')::integer;
  select candidate into v_seat_number
  from generate_series(1, v_capacity) candidate
  where not exists (
    select 1
    from jsonb_array_elements(coalesce(v_allocation_data -> 'passengers', '[]'::jsonb)) passenger
    where passenger ->> 'busId' = p_bus_id and passenger ->> 'seatNumber' = candidate::text
  )
  order by candidate limit 1;
  if v_seat_number is null then raise exception 'No remaining seats are available on this bus.'; end if;

  select name, phone, district_id, district, team_id, team, campus_id, campus
  into v_profile from public.profiles where id = v_actor_id;
  if not found or nullif(btrim(v_profile.name), '') is null or nullif(btrim(v_profile.phone), '') is null then
    raise exception 'Complete your profile before selecting a remaining seat.';
  end if;

  v_claim := jsonb_build_object(
    'allocationId', p_allocation_id::text, 'allocationName', v_allocation_name,
    'busId', p_bus_id, 'busLabel', v_bus ->> 'label',
    'destination', v_bus ->> 'destination', 'departureTime', v_bus ->> 'departureTime',
    'boardingPlace', v_bus ->> 'boardingPlace', 'seatNumber', v_seat_number::text,
    'amount', v_price, 'depositorName', btrim(p_depositor_name),
    'transferAccount', v_transfer_account, 'status', 'pending_payment',
    'requestedAt', v_now::text
  );
  v_reservation_data := jsonb_build_object(
    'id', v_reservation_id::text, 'name', v_profile.name, 'phone', v_profile.phone,
    'district', coalesce(v_profile.district, ''), 'team', coalesce(v_profile.team, ''),
    'campus', coalesce(v_profile.campus, ''), 'stationPreferences', '[]'::jsonb,
    'status', 'requested', 'remainingSeatClaim', v_claim, 'requestedAt', v_now::text
  );

  insert into public.reservations (
    id, user_id, name, phone, district_id, district, team_id, team, campus_id, campus,
    station_preferences, status, confirmed_ticket, data, created_at, updated_at
  ) values (
    v_reservation_id, v_actor_id, v_profile.name, v_profile.phone,
    v_profile.district_id, coalesce(v_profile.district, ''), v_profile.team_id,
    coalesce(v_profile.team, ''), v_profile.campus_id, coalesce(v_profile.campus, ''),
    '[]'::jsonb, 'requested', null, v_reservation_data, v_now, v_now
  )
  on conflict (id) do update set
    name = excluded.name,
    phone = excluded.phone,
    district_id = excluded.district_id,
    district = excluded.district,
    team_id = excluded.team_id,
    team = excluded.team,
    campus_id = excluded.campus_id,
    campus = excluded.campus,
    station_preferences = excluded.station_preferences,
    status = excluded.status,
    confirmed_ticket = null,
    data = excluded.data,
    updated_at = excluded.updated_at;

  delete from public.payments where reservation_id = v_reservation_id;
  insert into public.payments (user_id, reservation_id, amount, status, notes, updated_at)
  values (v_actor_id, v_reservation_id, v_price, 'pending', '잔여좌석 입금자명: ' || btrim(p_depositor_name), v_now);

  v_passenger := jsonb_build_object(
    'reservationId', v_reservation_id::text, 'name', v_profile.name,
    'phone', v_profile.phone, 'campus', coalesce(v_profile.campus, ''),
    'team', coalesce(v_profile.team, ''), 'preferences', jsonb_build_array(v_bus ->> 'destination'),
    'busId', p_bus_id, 'seatNumber', v_seat_number, 'remainingSeatStatus', 'pending_payment'
  );
  update public.bus_allocations
  set allocation_data = jsonb_set(
    v_allocation_data, '{passengers}',
    coalesce(v_allocation_data -> 'passengers', '[]'::jsonb) || jsonb_build_array(v_passenger), true
  )
  where id = p_allocation_id;

  return v_claim;
end;
$$;

create or replace function public.confirm_remaining_seat_payment(p_reservation_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id uuid := auth.uid();
  v_now timestamptz := clock_timestamp();
  v_reservation public.reservations;
  v_claim jsonb;
  v_ticket jsonb;
  v_allocation_data jsonb;
begin
  if not exists (
    select 1 from public.admin_roles where user_id = v_actor_id and role = 'global_admin'
  ) then raise exception 'Only global admins can confirm remaining seat payments.'; end if;

  select * into v_reservation from public.reservations where id = p_reservation_id for update;
  v_claim := v_reservation.data -> 'remainingSeatClaim';
  if v_reservation.id is null or v_claim ->> 'status' <> 'pending_payment' then
    raise exception 'Pending remaining seat claim not found.';
  end if;

  select allocation_data into v_allocation_data
  from public.bus_allocations where id = (v_claim ->> 'allocationId')::uuid for update;
  if v_allocation_data is null then raise exception 'The confirmed allocation is no longer available.'; end if;

  v_ticket := jsonb_build_object(
    'busNumber', v_claim ->> 'busLabel', 'seatNumber', v_claim ->> 'seatNumber',
    'departureTime', v_claim ->> 'departureTime', 'boardingPlace', v_claim ->> 'boardingPlace',
    'dropoffStation', v_claim ->> 'destination', 'managerNote', '마감 후 잔여좌석 · 서울지구 입금 확인',
    'confirmedAt', v_now::text
  );
  v_claim := jsonb_set(jsonb_set(v_claim, '{status}', '"confirmed"'::jsonb), '{confirmedAt}', to_jsonb(v_now::text));

  update public.reservations set
    status = 'confirmed', confirmed_ticket = v_ticket,
    data = jsonb_set(jsonb_set(jsonb_set(data, '{status}', '"confirmed"'::jsonb), '{confirmedTicket}', v_ticket, true), '{remainingSeatClaim}', v_claim, true),
    updated_at = v_now
  where id = p_reservation_id;

  update public.payments set
    status = 'completed', paid_at = v_now, verified_by = v_actor_id, verified_at = v_now, updated_at = v_now
  where reservation_id = p_reservation_id;

  update public.bus_allocations
  set allocation_data = jsonb_set(
    v_allocation_data, '{passengers}',
    (
      select coalesce(jsonb_agg(case when passenger ->> 'reservationId' = p_reservation_id::text then passenger - 'remainingSeatStatus' else passenger end), '[]'::jsonb)
      from jsonb_array_elements(coalesce(v_allocation_data -> 'passengers', '[]'::jsonb)) passenger
    ), true
  )
  where id = (v_claim ->> 'allocationId')::uuid;

  return v_ticket;
end;
$$;

create or replace function public.cancel_remaining_seat_claim(p_reservation_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id uuid := auth.uid();
  v_reservation public.reservations;
  v_claim jsonb;
  v_allocation_data jsonb;
  v_is_global_admin boolean;
begin
  select exists (
    select 1 from public.admin_roles where user_id = v_actor_id and role = 'global_admin'
  ) into v_is_global_admin;
  select * into v_reservation from public.reservations where id = p_reservation_id for update;
  v_claim := v_reservation.data -> 'remainingSeatClaim';

  if v_reservation.id is null or v_claim ->> 'status' <> 'pending_payment' then
    raise exception 'Pending remaining seat claim not found.';
  end if;
  if v_reservation.user_id is distinct from v_actor_id and not v_is_global_admin then
    raise exception 'Not authorized to cancel this remaining seat claim.';
  end if;

  select allocation_data into v_allocation_data
  from public.bus_allocations where id = (v_claim ->> 'allocationId')::uuid for update;
  if v_allocation_data is not null then
    update public.bus_allocations
    set allocation_data = jsonb_set(
      v_allocation_data, '{passengers}',
      (
        select coalesce(jsonb_agg(passenger), '[]'::jsonb)
        from jsonb_array_elements(coalesce(v_allocation_data -> 'passengers', '[]'::jsonb)) passenger
        where passenger ->> 'reservationId' <> p_reservation_id::text
      ), true
    )
    where id = (v_claim ->> 'allocationId')::uuid;
  end if;

  delete from public.reservations where id = p_reservation_id;
  return true;
end;
$$;

create or replace function public.update_remaining_seat_sales_settings(
  p_enabled boolean,
  p_hidden_bus_ids jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_value jsonb;
begin
  if not exists (
    select 1 from public.admin_roles where user_id = auth.uid() and role = 'global_admin'
  ) then raise exception 'Only global admins can update remaining seat sales settings.'; end if;
  if jsonb_typeof(coalesce(p_hidden_bus_ids, '[]'::jsonb)) <> 'array' then
    raise exception 'Hidden bus ids must be an array.';
  end if;

  v_value := jsonb_build_object('enabled', coalesce(p_enabled, false), 'hidden_bus_ids', coalesce(p_hidden_bus_ids, '[]'::jsonb));
  insert into public.app_settings (key, value, updated_at)
  values ('remaining_seat_sales', v_value, now())
  on conflict (key) do update set value = excluded.value, updated_at = now();
  return v_value;
end;
$$;

revoke all on function public.get_available_remaining_seats() from public;
grant execute on function public.get_available_remaining_seats() to authenticated;
revoke all on function public.claim_remaining_seat(uuid, text, text) from public;
grant execute on function public.claim_remaining_seat(uuid, text, text) to authenticated;
revoke all on function public.confirm_remaining_seat_payment(uuid) from public;
grant execute on function public.confirm_remaining_seat_payment(uuid) to authenticated;
revoke all on function public.cancel_remaining_seat_claim(uuid) from public;
grant execute on function public.cancel_remaining_seat_claim(uuid) to authenticated;
revoke all on function public.update_remaining_seat_sales_settings(boolean, jsonb) from public;
grant execute on function public.update_remaining_seat_sales_settings(boolean, jsonb) to authenticated;

notify pgrst, 'reload schema';
