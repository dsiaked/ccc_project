-- Preserve no-show context and require a reason when restoring a passenger to boarded.

drop function if exists public.set_passenger_boarding_status(uuid, text);

create or replace function public.set_passenger_boarding_status(
  p_reservation_id uuid,
  p_status text,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_current public.reservations%rowtype;
  v_allocation_id uuid;
  v_bus_id text;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_now timestamptz := clock_timestamp();
begin
  if not public.is_boarding_manager() then
    raise exception 'Only boarding managers can update boarding status.';
  end if;
  if p_status not in ('unchecked', 'boarded', 'no_show') then
    raise exception 'Invalid boarding status.';
  end if;
  if char_length(coalesce(v_reason, '')) > 500 then
    raise exception 'Boarding transition reasons must be 500 characters or fewer.';
  end if;

  select id into v_allocation_id
  from public.bus_allocations
  where allocation_data ->> 'status' = 'confirmed';
  if not found then raise exception 'Confirmed allocation not found.'; end if;

  select * into v_current
  from public.reservations
  where id = p_reservation_id
    and status = 'confirmed'
    and confirmed_ticket is not null
  for update;
  if not found then raise exception 'Confirmed passenger not found.'; end if;

  v_bus_id := public.get_confirmed_ticket_bus_id(v_current.id, v_current.confirmed_ticket);
  if not public.can_manage_boarding_bus(v_allocation_id, v_bus_id) then
    raise exception 'You are not assigned to this bus.';
  end if;
  if v_current.boarding_status = p_status then return; end if;
  if v_current.boarding_status = 'no_show' and p_status = 'boarded' and v_reason is null then
    raise exception 'A boarding transition reason is required.';
  end if;
  if p_status = 'no_show' and v_reason is null and not exists (
    select 1
    from public.boarding_bus_departures departure
    where departure.allocation_id = v_allocation_id
      and departure.cancelled_at is null
      and departure.bus_id = v_bus_id
  ) then
    raise exception 'No-show status is available after bus departure.';
  end if;

  update public.reservations
  set boarding_status = p_status,
      boarding_confirmed_at = case when p_status = 'boarded' then v_now else null end,
      boarding_status_updated_at = v_now,
      boarding_status_updated_by = auth.uid(),
      boarding_no_show_departure_id = null
  where id = p_reservation_id;

  insert into public.boarding_status_events (
    reservation_id, from_status, to_status, actor_id, note
  ) values (
    p_reservation_id,
    v_current.boarding_status,
    p_status,
    auth.uid(),
    case
      when v_reason is not null then 'boarding_status_changed: ' || v_reason
      else 'boarding_status_changed'
    end
  );
end;
$$;

drop function if exists public.set_walk_in_boarding_status(uuid, text);

create or replace function public.set_walk_in_boarding_status(
  p_walk_in_id uuid,
  p_status text,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_walk_in public.boarding_walk_in_passengers%rowtype;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_now timestamptz := clock_timestamp();
begin
  if not public.is_boarding_manager() then
    raise exception 'Only boarding managers can update boarding status.';
  end if;
  if p_status not in ('unchecked', 'boarded', 'no_show') then
    raise exception 'Invalid boarding status.';
  end if;
  if char_length(coalesce(v_reason, '')) > 500 then
    raise exception 'Boarding transition reasons must be 500 characters or fewer.';
  end if;

  select * into v_walk_in
  from public.boarding_walk_in_passengers
  where id = p_walk_in_id
  for update;
  if not found then raise exception 'Walk-in passenger not found.'; end if;
  if not public.can_manage_boarding_bus(v_walk_in.allocation_id, v_walk_in.bus_id) then
    raise exception 'You are not assigned to this bus.';
  end if;
  if v_walk_in.boarding_status = p_status then return; end if;
  if v_walk_in.boarding_status = 'no_show' and p_status = 'boarded' and v_reason is null then
    raise exception 'A boarding transition reason is required.';
  end if;
  if p_status = 'no_show' and v_reason is null and not exists (
    select 1 from public.boarding_bus_departures
    where allocation_id = v_walk_in.allocation_id
      and bus_id = v_walk_in.bus_id
      and cancelled_at is null
  ) then
    raise exception 'No-show status is available after bus departure.';
  end if;

  update public.boarding_walk_in_passengers
  set boarding_status = p_status,
      boarding_status_updated_by = auth.uid(),
      boarding_status_updated_at = v_now,
      boarding_no_show_departure_id = null,
      boarding_note = case
        when v_reason is not null then concat_ws(
          E'\n',
          nullif(boarding_note, ''),
          '[탑승 전환 사유] ' || v_reason
        )
        else boarding_note
      end,
      updated_at = v_now
  where id = p_walk_in_id;
end;
$$;

revoke all on function public.set_passenger_boarding_status(uuid, text, text)
  from public, anon;
revoke all on function public.set_walk_in_boarding_status(uuid, text, text)
  from public, anon;
grant execute on function public.set_passenger_boarding_status(uuid, text, text)
  to authenticated;
grant execute on function public.set_walk_in_boarding_status(uuid, text, text)
  to authenticated;

notify pgrst, 'reload schema';
