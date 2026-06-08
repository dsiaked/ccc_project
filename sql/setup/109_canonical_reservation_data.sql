-- Keep reservations columns authoritative while preserving extension data in data.

create or replace function public.sync_reservation_data_from_columns()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.data := (
    case
      when jsonb_typeof(new.data) = 'object' then new.data
      else '{}'::jsonb
    end
  ) || jsonb_build_object(
    'id', new.id::text,
    'name', new.name,
    'phone', new.phone,
    'district', new.district,
    'team', new.team,
    'campus', new.campus,
    'affiliationType', new.affiliation_type,
    'coordinatorName', new.coordinator_name,
    'coordinatorPhone', new.coordinator_phone,
    'stationPreferences', coalesce(new.station_preferences, '[]'::jsonb),
    'status', new.status,
    'confirmedTicket', new.confirmed_ticket,
    'boardingConfirmedAt', new.boarding_confirmed_at,
    'requestedAt', new.created_at::text,
    'updatedAt', new.updated_at::text
  );

  return new;
end;
$$;

drop trigger if exists zz_sync_reservation_data_from_columns
  on public.reservations;
create trigger zz_sync_reservation_data_from_columns
before insert or update on public.reservations
for each row execute function public.sync_reservation_data_from_columns();

-- Existing extension keys, including remainingSeatClaim, are retained by the trigger.
update public.reservations
set data = coalesce(data, '{}'::jsonb);

notify pgrst, 'reload schema';
