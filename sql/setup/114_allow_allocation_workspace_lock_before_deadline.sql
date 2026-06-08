-- Allow opening an existing allocation workspace before the reservation deadline.
-- Substantive allocation writes remain blocked until the deadline is closed.

create or replace function public.require_closed_reservation_deadline_for_allocation()
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

notify pgrst, 'reload schema';
