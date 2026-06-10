-- Allow status corrections and notes after departure while keeping the roster locked.

create or replace function public.prevent_departed_bus_reservation_changes()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_allocation_id uuid;
  v_old_bus_id text;
  v_new_bus_id text;
  v_departure_id uuid;
begin
  if old.confirmed_ticket is null then return new; end if;

  select id into v_allocation_id
  from public.bus_allocations
  where allocation_data ->> 'status' = 'confirmed';
  if not found then return new; end if;

  v_old_bus_id := public.get_confirmed_ticket_bus_id(old.id, old.confirmed_ticket);
  v_new_bus_id := public.get_confirmed_ticket_bus_id(new.id, new.confirmed_ticket);

  select departure.id into v_departure_id
  from public.boarding_bus_departures departure
  where departure.allocation_id = v_allocation_id
    and departure.bus_id in (v_old_bus_id, v_new_bus_id)
    and departure.cancelled_at is null
  limit 1;
  if v_departure_id is null then return new; end if;

  if old.boarding_status = 'unchecked'
    and new.boarding_status = 'no_show'
    and new.boarding_no_show_departure_id = v_departure_id then
    return new;
  end if;
  if old.boarding_status = 'no_show'
    and new.boarding_status = 'unchecked'
    and old.boarding_no_show_departure_id = v_departure_id
    and new.boarding_no_show_departure_id is null then
    return new;
  end if;

  if old.confirmed_ticket is distinct from new.confirmed_ticket then
    raise exception 'Departed bus assignments are locked until departure is cancelled.';
  end if;
  if old.boarding_status is distinct from new.boarding_status
    and new.boarding_status = 'unchecked' then
    raise exception 'Departed buses cannot return passengers to unchecked status.';
  end if;

  return new;
end;
$$;

create or replace function public.prevent_departed_bus_walk_in_changes()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_allocation_id uuid;
  v_bus_id text;
  v_departure_id uuid;
begin
  if tg_op = 'DELETE' then
    v_allocation_id := old.allocation_id;
    v_bus_id := old.bus_id;
  else
    v_allocation_id := new.allocation_id;
    v_bus_id := new.bus_id;
  end if;

  select departure.id into v_departure_id
  from public.boarding_bus_departures departure
  where departure.allocation_id = v_allocation_id
    and departure.bus_id = v_bus_id
    and departure.cancelled_at is null
  limit 1;
  if v_departure_id is null then
    if tg_op = 'DELETE' then return old; else return new; end if;
  end if;

  if tg_op = 'UPDATE'
    and old.boarding_status = 'unchecked'
    and new.boarding_status = 'no_show'
    and new.boarding_no_show_departure_id = v_departure_id then
    return new;
  end if;
  if tg_op = 'UPDATE'
    and old.boarding_status = 'no_show'
    and new.boarding_status = 'unchecked'
    and old.boarding_no_show_departure_id = v_departure_id
    and new.boarding_no_show_departure_id is null then
    return new;
  end if;

  if tg_op <> 'UPDATE' then
    raise exception 'Departed bus rosters are locked until departure is cancelled.';
  end if;
  if old.allocation_id is distinct from new.allocation_id
    or old.bus_id is distinct from new.bus_id
    or old.seat_number is distinct from new.seat_number
    or old.name is distinct from new.name
    or old.phone is distinct from new.phone
    or old.campus is distinct from new.campus
    or old.reason is distinct from new.reason then
    raise exception 'Departed bus assignments are locked until departure is cancelled.';
  end if;
  if old.boarding_status is distinct from new.boarding_status
    and new.boarding_status = 'unchecked' then
    raise exception 'Departed buses cannot return passengers to unchecked status.';
  end if;

  return new;
end;
$$;

revoke all on function public.prevent_departed_bus_reservation_changes()
  from public, anon, authenticated;
revoke all on function public.prevent_departed_bus_walk_in_changes()
  from public, anon, authenticated;

notify pgrst, 'reload schema';
