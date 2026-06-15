-- Destination-queue boarding assigns a bus and marks the passenger boarded in one update.
-- Preserve that explicit status instead of resetting it because the ticket gained a bus ID.
create or replace function public.reset_boarding_confirmation_on_ticket_change()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if old.status is distinct from new.status
    or old.confirmed_ticket is distinct from new.confirmed_ticket then
    if old.status = 'confirmed'
      and new.status = 'confirmed'
      and old.confirmed_ticket ->> 'allocationStrategy' = 'destination_queue'
      and new.confirmed_ticket ->> 'allocationStrategy' = 'destination_queue'
      and nullif(old.confirmed_ticket ->> 'busId', '') is null
      and nullif(new.confirmed_ticket ->> 'busId', '') is not null
      and old.boarding_status = 'unchecked'
      and new.boarding_status = 'boarded'
      and new.boarding_confirmed_at is not null then
      return new;
    end if;

    new.boarding_confirmed_at := null;
    new.boarding_status := 'unchecked';
    new.boarding_status_updated_at := null;
    new.boarding_status_updated_by := null;
    new.boarding_no_show_departure_id := null;
  end if;

  return new;
end;
$$;
