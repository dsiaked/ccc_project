-- Keep remaining-seat passenger metadata in allocation workspaces.

create or replace function public.normalize_allocation_remaining_seat_passengers()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_passengers jsonb;
begin
  if jsonb_typeof(new.allocation_data -> 'passengers') <> 'array' then
    return new;
  end if;

  select coalesce(
    jsonb_agg(
      case
        when reservation.data ? 'remainingSeatClaim' then
          entry.passenger || jsonb_build_object(
            'source', 'remaining_seat',
            'remainingSeatStatus',
              coalesce(
                reservation.data #>> '{remainingSeatClaim,status}',
                entry.passenger ->> 'remainingSeatStatus',
                'pending_payment'
              ),
            'preferences',
              jsonb_build_array(
                coalesce(
                  reservation.data #>> '{remainingSeatClaim,destination}',
                  entry.passenger #>> '{preferences,0}'
                )
              )
          )
        else entry.passenger
      end
      order by entry.ordinality
    ),
    '[]'::jsonb
  )
  into v_passengers
  from jsonb_array_elements(new.allocation_data -> 'passengers')
    with ordinality as entry(passenger, ordinality)
  left join public.reservations reservation
    on reservation.id::text = entry.passenger ->> 'reservationId';

  new.allocation_data := jsonb_set(
    new.allocation_data,
    '{passengers}',
    v_passengers,
    true
  );
  return new;
end;
$$;

drop trigger if exists normalize_allocation_remaining_seat_passengers
  on public.bus_allocations;
create trigger normalize_allocation_remaining_seat_passengers
before insert or update of allocation_data on public.bus_allocations
for each row execute function public.normalize_allocation_remaining_seat_passengers();

update public.bus_allocations
set allocation_data = allocation_data
where exists (
  select 1
  from jsonb_array_elements(
    coalesce(bus_allocations.allocation_data -> 'passengers', '[]'::jsonb)
  ) passenger
  join public.reservations reservation
    on reservation.id::text = passenger ->> 'reservationId'
  where reservation.data ? 'remainingSeatClaim'
);

notify pgrst, 'reload schema';
