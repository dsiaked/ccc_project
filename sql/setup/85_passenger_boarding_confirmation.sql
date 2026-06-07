-- =========================================================
-- Passenger boarding confirmation
-- The onboard leader checks the passenger's signed-in ticket screen.
-- =========================================================

alter table public.reservations
  add column if not exists boarding_confirmed_at timestamptz;

create index if not exists idx_reservations_boarding_confirmed_at
  on public.reservations(boarding_confirmed_at)
  where boarding_confirmed_at is not null;

create or replace function public.reset_boarding_confirmation_on_ticket_change()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if old.status is distinct from new.status
    or old.confirmed_ticket is distinct from new.confirmed_ticket then
    new.boarding_confirmed_at := null;
  end if;

  return new;
end;
$$;

drop trigger if exists reset_boarding_confirmation_on_ticket_change
  on public.reservations;

create trigger reset_boarding_confirmation_on_ticket_change
before update of status, confirmed_ticket on public.reservations
for each row
execute function public.reset_boarding_confirmation_on_ticket_change();

create or replace function public.confirm_my_boarding()
returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_confirmed_at timestamptz;
begin
  if v_user_id is null then
    raise exception 'Authentication is required.';
  end if;

  update public.reservations
  set boarding_confirmed_at = coalesce(boarding_confirmed_at, clock_timestamp())
  where user_id = v_user_id
    and status = 'confirmed'
    and jsonb_typeof(confirmed_ticket) = 'object'
  returning boarding_confirmed_at into v_confirmed_at;

  if v_confirmed_at is null then
    raise exception 'A confirmed ticket is required before boarding confirmation.';
  end if;

  return v_confirmed_at;
end;
$$;

revoke all on function public.confirm_my_boarding() from public, anon;
grant execute on function public.confirm_my_boarding() to authenticated;

notify pgrst, 'reload schema';
