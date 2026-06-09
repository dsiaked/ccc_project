-- =========================================================
-- Keep reservation-deadline triggers specific to each row shape
-- =========================================================

create or replace function public.assert_allocation_planning_unlocked()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if current_setting('app.allocation_confirmation_write', true) = 'on' then
    return;
  end if;

  if exists (
    select 1
    from public.bus_allocations
    where allocation_data ->> 'status' = 'confirmed'
  ) then
    raise exception 'Cancel the confirmed allocation before using allocation planning.';
  end if;
end;
$$;

create or replace function public.require_closed_reservation_deadline_for_optimization_job()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_deadline_at timestamptz;
begin
  select nullif(value ->> 'deadline_at', '')::timestamptz
  into v_deadline_at
  from public.app_settings
  where key = 'first_reservation_deadline'
  for share;

  if v_deadline_at is null or v_deadline_at > clock_timestamp() then
    raise exception 'Allocation is available only after the reservation deadline.';
  end if;

  return new;
end;
$$;

create or replace function public.require_closed_reservation_deadline_for_bus_allocation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_deadline_at timestamptz;
begin
  if tg_op = 'UPDATE'
    and (to_jsonb(new) - 'allocation_data' - 'updated_at' - 'revision')
      = (to_jsonb(old) - 'allocation_data' - 'updated_at' - 'revision')
    and (new.allocation_data - 'editLock') = (old.allocation_data - 'editLock')
    and new.revision = old.revision + 1 then
    return new;
  end if;

  select nullif(value ->> 'deadline_at', '')::timestamptz
  into v_deadline_at
  from public.app_settings
  where key = 'first_reservation_deadline'
  for share;

  if v_deadline_at is null or v_deadline_at > clock_timestamp() then
    raise exception 'Allocation is available only after the reservation deadline.';
  end if;

  return new;
end;
$$;

drop trigger if exists require_closed_deadline_for_allocation_job
  on public.allocation_optimization_jobs;
create trigger require_closed_deadline_for_allocation_job
before insert on public.allocation_optimization_jobs
for each row execute function public.require_closed_reservation_deadline_for_optimization_job();

drop trigger if exists require_closed_deadline_for_bus_allocation
  on public.bus_allocations;
create trigger require_closed_deadline_for_bus_allocation
before insert or update on public.bus_allocations
for each row execute function public.require_closed_reservation_deadline_for_bus_allocation();

drop function if exists public.require_closed_reservation_deadline_for_allocation();

revoke all on function public.assert_allocation_planning_unlocked()
  from public, anon, authenticated;
revoke all on function public.require_closed_reservation_deadline_for_optimization_job()
  from public, anon, authenticated;
revoke all on function public.require_closed_reservation_deadline_for_bus_allocation()
  from public, anon, authenticated;

notify pgrst, 'reload schema';
