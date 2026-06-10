-- A confirmed allocation cannot be cancelled while any bus is departed.

create or replace function public.prevent_allocation_cancel_after_departure()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.allocation_data ->> 'status' = 'confirmed'
    and new.allocation_data ->> 'status' <> 'confirmed'
    and exists (
      select 1
      from public.boarding_bus_departures departure
      where departure.allocation_id = old.id
        and departure.cancelled_at is null
    ) then
    raise exception 'Cancel all bus departures before cancelling the confirmed allocation.';
  end if;

  return new;
end;
$$;

drop trigger if exists block_allocation_cancel_after_departure
  on public.bus_allocations;
create trigger block_allocation_cancel_after_departure
before update of allocation_data on public.bus_allocations
for each row
execute function public.prevent_allocation_cancel_after_departure();

revoke all on function public.prevent_allocation_cancel_after_departure()
  from public, anon, authenticated;

notify pgrst, 'reload schema';
