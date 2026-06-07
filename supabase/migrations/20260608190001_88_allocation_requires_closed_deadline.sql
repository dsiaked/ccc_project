-- =========================================================
-- Require the reservation deadline to be closed for allocation work
-- =========================================================

create or replace function public.require_closed_reservation_deadline_for_allocation()
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

drop trigger if exists require_closed_deadline_for_allocation_job
on public.allocation_optimization_jobs;
create trigger require_closed_deadline_for_allocation_job
before insert on public.allocation_optimization_jobs
for each row execute function public.require_closed_reservation_deadline_for_allocation();

drop trigger if exists require_closed_deadline_for_bus_allocation
on public.bus_allocations;
create trigger require_closed_deadline_for_bus_allocation
before insert or update on public.bus_allocations
for each row execute function public.require_closed_reservation_deadline_for_allocation();

notify pgrst, 'reload schema';
