-- Require and preserve a reason when unlocking a departed bus.

alter table public.boarding_bus_departures
  add column if not exists cancellation_reason text;

drop function if exists public.cancel_boarding_bus_departure(text);

create or replace function public.cancel_boarding_bus_departure(
  p_bus_id text,
  p_reason text
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_departure public.boarding_bus_departures%rowtype;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_restored_reservations integer := 0;
  v_restored_walk_ins integer := 0;
  v_now timestamptz := clock_timestamp();
begin
  if not public.is_boarding_manager() then
    raise exception 'Only boarding managers can cancel departure.';
  end if;
  if v_reason is null then
    raise exception 'A departure cancellation reason is required.';
  end if;
  if char_length(v_reason) > 500 then
    raise exception 'Departure cancellation reasons must be 500 characters or fewer.';
  end if;

  select * into v_departure
  from public.boarding_bus_departures
  where bus_id = p_bus_id and cancelled_at is null
  order by departed_at desc
  limit 1
  for update;
  if not found then raise exception 'Active bus departure not found.'; end if;
  if not public.can_manage_boarding_bus(v_departure.allocation_id, p_bus_id) then
    raise exception 'You are not assigned to this bus.';
  end if;

  with changed as (
    update public.reservations
    set boarding_status = 'unchecked',
        boarding_status_updated_at = v_now,
        boarding_status_updated_by = auth.uid(),
        boarding_no_show_departure_id = null
    where boarding_no_show_departure_id = v_departure.id
      and boarding_status = 'no_show'
    returning id
  ),
  events as (
    insert into public.boarding_status_events (
      reservation_id, from_status, to_status, actor_id, note
    )
    select
      id,
      'no_show',
      'unchecked',
      auth.uid(),
      'bus_departure_cancelled_auto_restore: ' || v_reason
    from changed
    returning 1
  )
  select count(*) into v_restored_reservations from events;

  update public.boarding_walk_in_passengers
  set boarding_status = 'unchecked',
      boarding_status_updated_at = v_now,
      boarding_status_updated_by = auth.uid(),
      boarding_no_show_departure_id = null,
      boarding_note = concat_ws(
        E'\n',
        nullif(boarding_note, ''),
        '[출발 완료 취소] ' || v_reason
      ),
      updated_at = v_now
  where boarding_no_show_departure_id = v_departure.id
    and boarding_status = 'no_show';
  get diagnostics v_restored_walk_ins = row_count;

  update public.boarding_bus_departures
  set cancelled_at = v_now,
      cancelled_by = auth.uid(),
      cancellation_reason = v_reason
  where id = v_departure.id;

  return v_restored_reservations + v_restored_walk_ins;
end;
$$;

revoke all on function public.cancel_boarding_bus_departure(text, text)
  from public, anon;
grant execute on function public.cancel_boarding_bus_departure(text, text)
  to authenticated;

notify pgrst, 'reload schema';
