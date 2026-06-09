-- =========================================================
-- Rate-limit passenger boarding check-in code attempts
-- =========================================================

create table if not exists public.boarding_check_in_attempts (
  allocation_id uuid not null references public.bus_allocations(id) on delete cascade,
  reservation_id uuid not null references public.reservations(id) on delete cascade,
  failed_attempts integer not null default 0 check (failed_attempts >= 0),
  locked_until timestamptz,
  last_failed_at timestamptz,
  updated_at timestamptz not null default clock_timestamp(),
  primary key (allocation_id, reservation_id)
);

alter table public.boarding_check_in_attempts enable row level security;
revoke all on table public.boarding_check_in_attempts
  from public, anon, authenticated;

drop function if exists public.submit_boarding_check_in_code(text);
create function public.submit_boarding_check_in_code(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_code text := trim(coalesce(p_code, ''));
  v_reservation public.reservations%rowtype;
  v_allocation public.bus_allocations%rowtype;
  v_attempt public.boarding_check_in_attempts%rowtype;
  v_bus_id text;
  v_failed_attempts integer;
  v_locked_until timestamptz;
  v_now timestamptz := clock_timestamp();
begin
  if v_user_id is null then raise exception 'Authentication is required.'; end if;

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

  v_bus_id := public.get_confirmed_ticket_bus_id(
    v_reservation.id,
    v_reservation.confirmed_ticket
  );
  if v_bus_id is null then raise exception 'Assigned bus not found.'; end if;

  if exists (
    select 1 from public.boarding_bus_departures
    where allocation_id = v_allocation.id
      and bus_id = v_bus_id
      and cancelled_at is null
  ) then
    raise exception 'This bus has already departed.';
  end if;

  insert into public.boarding_check_in_attempts (
    allocation_id, reservation_id
  ) values (
    v_allocation.id, v_reservation.id
  )
  on conflict (allocation_id, reservation_id) do nothing;

  select * into v_attempt
  from public.boarding_check_in_attempts
  where allocation_id = v_allocation.id
    and reservation_id = v_reservation.id
  for update;

  if v_attempt.locked_until is not null and v_attempt.locked_until > v_now then
    return jsonb_build_object(
      'success', false,
      'errorCode', 'LOCKED',
      'message', 'Too many incorrect check-in code attempts. Try again later.',
      'lockedUntil', v_attempt.locked_until
    );
  end if;

  if v_code !~ '^[0-9]{4}$' or not exists (
    select 1 from public.boarding_check_in_codes
    where allocation_id = v_allocation.id
      and bus_id = v_bus_id
      and check_in_code = v_code
      and expires_at > v_now
  ) then
    v_failed_attempts := case
      when v_attempt.locked_until is not null and v_attempt.locked_until <= v_now then 1
      else v_attempt.failed_attempts + 1
    end;
    v_locked_until := case
      when v_failed_attempts >= 5 then v_now + interval '15 minutes'
      else null
    end;

    update public.boarding_check_in_attempts
    set
      failed_attempts = v_failed_attempts,
      locked_until = v_locked_until,
      last_failed_at = v_now,
      updated_at = v_now
    where allocation_id = v_allocation.id
      and reservation_id = v_reservation.id;

    return jsonb_build_object(
      'success', false,
      'errorCode', case when v_locked_until is null then 'INVALID_CODE' else 'LOCKED' end,
      'message', case
        when v_locked_until is null then 'The check-in code is incorrect or expired.'
        else 'Too many incorrect check-in code attempts. Try again later.'
      end,
      'remainingAttempts', greatest(0, 5 - v_failed_attempts),
      'lockedUntil', v_locked_until
    );
  end if;

  delete from public.boarding_check_in_attempts
  where allocation_id = v_allocation.id
    and reservation_id = v_reservation.id;

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

  return jsonb_build_object(
    'success', true,
    'confirmedAt', coalesce(v_reservation.boarding_confirmed_at, v_now)
  );
end;
$$;

revoke all on function public.submit_boarding_check_in_code(text) from public, anon;
grant execute on function public.submit_boarding_check_in_code(text) to authenticated;

notify pgrst, 'reload schema';
