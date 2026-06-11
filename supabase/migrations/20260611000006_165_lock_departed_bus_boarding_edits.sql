-- Lock boarding status and note edits after a bus has departed.

do $$
declare
  v_definition text;
  v_updated text;
begin
  select pg_get_functiondef('public.set_passenger_boarding_status(uuid,text,text)'::regprocedure)
  into v_definition;
  v_updated := replace(
    v_definition,
    E'  if v_current.boarding_status = p_status then return; end if;',
    E'  if exists (\n    select 1 from public.boarding_bus_departures departure\n    where departure.allocation_id = v_allocation_id\n      and departure.bus_id = v_bus_id\n      and departure.cancelled_at is null\n  ) then\n    raise exception ''Departed buses cannot update boarding status.'';\n  end if;\n  if v_current.boarding_status = p_status then return; end if;'
  );
  if v_updated = v_definition then raise exception 'Could not lock passenger boarding status edits.'; end if;
  execute v_updated;

  select pg_get_functiondef('public.set_walk_in_boarding_status(uuid,text,text)'::regprocedure)
  into v_definition;
  v_updated := replace(
    v_definition,
    E'  if v_walk_in.boarding_status = p_status then return; end if;',
    E'  if exists (\n    select 1 from public.boarding_bus_departures departure\n    where departure.allocation_id = v_walk_in.allocation_id\n      and departure.bus_id = v_walk_in.bus_id\n      and departure.cancelled_at is null\n  ) then\n    raise exception ''Departed buses cannot update boarding status.'';\n  end if;\n  if v_walk_in.boarding_status = p_status then return; end if;'
  );
  if v_updated = v_definition then raise exception 'Could not lock walk-in boarding status edits.'; end if;
  execute v_updated;

  select pg_get_functiondef('public.update_passenger_boarding_note(uuid,text)'::regprocedure)
  into v_definition;
  v_updated := replace(
    v_definition,
    E'  if not public.can_manage_boarding_reservation(p_reservation_id) then\n    raise exception ''You are not assigned to this bus.'';\n  end if;',
    E'  if not public.can_manage_boarding_reservation(p_reservation_id) then\n    raise exception ''You are not assigned to this bus.'';\n  end if;\n  if exists (\n    select 1\n    from public.reservations reservation\n    join public.bus_allocations allocation on allocation.allocation_data ->> ''status'' = ''confirmed''\n    join public.boarding_bus_departures departure\n      on departure.allocation_id = allocation.id\n     and departure.bus_id = public.get_confirmed_ticket_bus_id(reservation.id, reservation.confirmed_ticket)\n     and departure.cancelled_at is null\n    where reservation.id = p_reservation_id\n  ) then\n    raise exception ''Departed buses cannot update boarding notes.'';\n  end if;'
  );
  if v_updated = v_definition then raise exception 'Could not lock passenger boarding note edits.'; end if;
  execute v_updated;

  select pg_get_functiondef('public.update_walk_in_boarding_note(uuid,text)'::regprocedure)
  into v_definition;
  v_updated := replace(
    v_definition,
    E'  if not public.can_manage_boarding_bus(v_walk_in.allocation_id, v_walk_in.bus_id) then\n    raise exception ''You are not assigned to this bus.'';\n  end if;',
    E'  if not public.can_manage_boarding_bus(v_walk_in.allocation_id, v_walk_in.bus_id) then\n    raise exception ''You are not assigned to this bus.'';\n  end if;\n  if exists (\n    select 1 from public.boarding_bus_departures departure\n    where departure.allocation_id = v_walk_in.allocation_id\n      and departure.bus_id = v_walk_in.bus_id\n      and departure.cancelled_at is null\n  ) then\n    raise exception ''Departed buses cannot update boarding notes.'';\n  end if;'
  );
  if v_updated = v_definition then raise exception 'Could not lock walk-in boarding note edits.'; end if;
  execute v_updated;
end;
$$;

notify pgrst, 'reload schema';
