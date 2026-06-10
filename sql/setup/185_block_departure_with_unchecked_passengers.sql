-- Require every passenger status to be resolved before marking bus departure.

create or replace function public.mark_boarding_bus_departed(p_bus_id text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_allocation public.bus_allocations%rowtype;
  v_bus jsonb;
  v_departure_id uuid;
  v_unchecked_count integer := 0;
  v_now timestamptz := clock_timestamp();
begin
  if not public.is_boarding_manager() then
    raise exception 'Only boarding managers can mark departure.';
  end if;

  select * into v_allocation from public.bus_allocations
  where allocation_data ->> 'status' = 'confirmed'
  for update;
  if not found then raise exception 'Confirmed allocation not found.'; end if;
  if not public.can_manage_boarding_bus(v_allocation.id, p_bus_id) then
    raise exception 'You are not assigned to this bus.';
  end if;

  select bus into v_bus
  from jsonb_array_elements(v_allocation.allocation_data -> 'buses') bus
  where bus ->> 'id' = p_bus_id;
  if v_bus is null then raise exception 'Bus not found.'; end if;

  select
    (
      select count(*)
      from public.reservations reservation
      where reservation.status = 'confirmed'
        and reservation.boarding_status = 'unchecked'
        and public.get_confirmed_ticket_bus_id(
          reservation.id,
          reservation.confirmed_ticket
        ) = p_bus_id
    )
    +
    (
      select count(*)
      from public.boarding_walk_in_passengers walk_in
      where walk_in.allocation_id = v_allocation.id
        and walk_in.bus_id = p_bus_id
        and walk_in.boarding_status = 'unchecked'
    )
  into v_unchecked_count;

  if v_unchecked_count > 0 then
    raise exception 'Resolve all unchecked passengers before marking departure.';
  end if;

  insert into public.boarding_bus_departures (
    allocation_id, bus_id, bus_label, departed_at, departed_by
  ) values (
    v_allocation.id, p_bus_id, v_bus ->> 'label', v_now, auth.uid()
  ) returning id into v_departure_id;

  return v_departure_id;
end;
$$;

revoke all on function public.mark_boarding_bus_departed(text) from public, anon;
grant execute on function public.mark_boarding_bus_departed(text) to authenticated;

notify pgrst, 'reload schema';
