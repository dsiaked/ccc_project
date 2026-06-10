-- Make a departed bus read-only until its departure is cancelled.

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

  if old.confirmed_ticket is distinct from new.confirmed_ticket
    or old.boarding_status is distinct from new.boarding_status
    or old.boarding_confirmed_at is distinct from new.boarding_confirmed_at
    or old.boarding_no_show_departure_id is distinct from new.boarding_no_show_departure_id
    or old.boarding_note is distinct from new.boarding_note then
    raise exception 'Departed buses are read-only until departure is cancelled.';
  end if;

  return new;
end;
$$;

drop trigger if exists lock_departed_bus_reservation_changes on public.reservations;
create trigger lock_departed_bus_reservation_changes
before update on public.reservations
for each row execute function public.prevent_departed_bus_reservation_changes();

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

  raise exception 'Departed buses are read-only until departure is cancelled.';
end;
$$;

drop trigger if exists lock_departed_bus_walk_in_changes
  on public.boarding_walk_in_passengers;
create trigger lock_departed_bus_walk_in_changes
before insert or update or delete on public.boarding_walk_in_passengers
for each row execute function public.prevent_departed_bus_walk_in_changes();

create or replace function public.prevent_departed_bus_check_in_code_changes()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_allocation_id uuid;
  v_bus_id text;
begin
  if tg_op = 'DELETE' then
    v_allocation_id := old.allocation_id;
    v_bus_id := old.bus_id;
  else
    v_allocation_id := new.allocation_id;
    v_bus_id := new.bus_id;
  end if;

  if exists (
    select 1
    from public.boarding_bus_departures departure
    where departure.allocation_id = v_allocation_id
      and departure.bus_id = v_bus_id
      and departure.cancelled_at is null
  ) then
    raise exception 'Departed buses are read-only until departure is cancelled.';
  end if;

  if tg_op = 'DELETE' then return old; else return new; end if;
end;
$$;

drop trigger if exists lock_departed_bus_check_in_code_changes
  on public.boarding_check_in_codes;
create trigger lock_departed_bus_check_in_code_changes
before insert or update or delete on public.boarding_check_in_codes
for each row execute function public.prevent_departed_bus_check_in_code_changes();

revoke all on function public.prevent_departed_bus_reservation_changes()
  from public, anon, authenticated;
revoke all on function public.prevent_departed_bus_walk_in_changes()
  from public, anon, authenticated;
revoke all on function public.prevent_departed_bus_check_in_code_changes()
  from public, anon, authenticated;

notify pgrst, 'reload schema';
