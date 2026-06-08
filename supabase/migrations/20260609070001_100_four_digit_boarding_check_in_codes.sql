-- =========================================================
-- Convert passenger self check-in codes from six to four digits
-- =========================================================

delete from public.boarding_check_in_codes
where check_in_code !~ '^[0-9]{4}$';

alter table public.boarding_check_in_codes
  drop constraint if exists boarding_check_in_codes_check_in_code_check;

alter table public.boarding_check_in_codes
  add constraint boarding_check_in_codes_check_in_code_check
  check (check_in_code ~ '^[0-9]{4}$');

create or replace function public.rotate_boarding_check_in_code(p_bus_id text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_allocation public.bus_allocations%rowtype;
  v_bus jsonb;
  v_code text;
begin
  select * into v_allocation
  from public.bus_allocations
  where allocation_data ->> 'status' = 'confirmed';

  if not found then raise exception 'Confirmed allocation not found.'; end if;
  if not public.can_manage_boarding_bus(v_allocation.id, p_bus_id) then
    raise exception 'You cannot manage this bus.';
  end if;

  select bus into v_bus
  from jsonb_array_elements(v_allocation.allocation_data -> 'buses') bus
  where bus ->> 'id' = p_bus_id;
  if v_bus is null then raise exception 'Bus not found.'; end if;

  if exists (
    select 1 from public.boarding_bus_departures
    where allocation_id = v_allocation.id
      and bus_id = p_bus_id
      and cancelled_at is null
  ) then
    raise exception 'A departed bus cannot issue a check-in code.';
  end if;

  v_code := lpad(floor(random() * 10000)::integer::text, 4, '0');

  insert into public.boarding_check_in_codes (
    allocation_id, bus_id, bus_label, check_in_code, created_at, created_by, expires_at
  )
  values (
    v_allocation.id, p_bus_id, v_bus ->> 'label', v_code,
    clock_timestamp(), auth.uid(), clock_timestamp() + interval '12 hours'
  )
  on conflict (allocation_id, bus_id) do update
  set bus_label = excluded.bus_label,
      check_in_code = excluded.check_in_code,
      created_at = excluded.created_at,
      created_by = excluded.created_by,
      expires_at = excluded.expires_at;

  return v_code;
end;
$$;

create or replace function public.submit_boarding_check_in_code(p_code text)
returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_code text := trim(coalesce(p_code, ''));
  v_reservation public.reservations%rowtype;
  v_allocation public.bus_allocations%rowtype;
  v_bus jsonb;
  v_now timestamptz := clock_timestamp();
begin
  if v_user_id is null then raise exception 'Authentication is required.'; end if;
  if v_code !~ '^[0-9]{4}$' then raise exception 'Enter the 4-digit check-in code.'; end if;

  select * into v_reservation
  from public.reservations
  where user_id = v_user_id
    and status = 'confirmed'
    and confirmed_ticket is not null
  for update;
  if not found then raise exception 'A confirmed ticket is required before check-in.'; end if;

  select * into v_allocation
  from public.bus_allocations
  where allocation_data ->> 'status' = 'confirmed';
  if not found then raise exception 'Confirmed allocation not found.'; end if;

  select bus into v_bus
  from jsonb_array_elements(v_allocation.allocation_data -> 'buses') bus
  where bus ->> 'label' = v_reservation.confirmed_ticket ->> 'busNumber';
  if v_bus is null then raise exception 'Assigned bus not found.'; end if;

  if exists (
    select 1 from public.boarding_bus_departures
    where allocation_id = v_allocation.id
      and bus_id = v_bus ->> 'id'
      and cancelled_at is null
  ) then
    raise exception 'This bus has already departed.';
  end if;

  if not exists (
    select 1 from public.boarding_check_in_codes
    where allocation_id = v_allocation.id
      and bus_id = v_bus ->> 'id'
      and check_in_code = v_code
      and expires_at > v_now
  ) then
    raise exception 'The check-in code is incorrect or expired.';
  end if;

  if v_reservation.boarding_status <> 'boarded' then
    update public.reservations
    set boarding_status = 'boarded',
        boarding_confirmed_at = v_now,
        boarding_status_updated_at = v_now,
        boarding_status_updated_by = v_user_id,
        boarding_no_show_departure_id = null
    where id = v_reservation.id;

    insert into public.boarding_status_events (
      reservation_id, from_status, to_status, actor_id, note
    ) values (
      v_reservation.id, v_reservation.boarding_status, 'boarded', v_user_id,
      'passenger_check_in_code'
    );
  end if;

  return coalesce(v_reservation.boarding_confirmed_at, v_now);
end;
$$;
