-- =========================================================
-- Keep reservation status and confirmed ticket columns canonical.
-- JSON fields remain compatibility mirrors for older clients.
-- =========================================================

create or replace function public.sync_reservation_canonical_fields()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.status <> 'confirmed' then
    new.confirmed_ticket := null;
  end if;

  new.data := jsonb_set(
    coalesce(new.data, '{}'::jsonb),
    '{status}',
    to_jsonb(new.status),
    true
  );

  if new.confirmed_ticket is null then
    new.data := new.data - 'confirmedTicket';
  else
    new.data := jsonb_set(
      new.data,
      '{confirmedTicket}',
      new.confirmed_ticket,
      true
    );
  end if;

  return new;
end;
$$;

update public.reservations
set status = 'requested'
where status is null;

alter table public.reservations
  alter column status set default 'requested';

alter table public.reservations
  alter column status set not null;

drop trigger if exists sync_reservation_canonical_fields
  on public.reservations;

create trigger sync_reservation_canonical_fields
before insert or update of status, confirmed_ticket, data
on public.reservations
for each row
execute function public.sync_reservation_canonical_fields();

update public.reservations
set data = data
where coalesce(data ->> 'status', '') is distinct from status
  or data -> 'confirmedTicket' is distinct from confirmed_ticket
  or (status <> 'confirmed' and confirmed_ticket is not null);

revoke all on function public.sync_reservation_canonical_fields() from public, anon;

notify pgrst, 'reload schema';
