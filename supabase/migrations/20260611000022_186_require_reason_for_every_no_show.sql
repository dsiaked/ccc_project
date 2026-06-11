-- Require a reason for every manual no-show transition.

do $$
declare
  v_definition text;
  v_updated_definition text;
begin
  select pg_get_functiondef(
    'public.set_passenger_boarding_status(uuid,text,text)'::regprocedure
  ) into v_definition;
  v_definition := replace(v_definition, E'\r\n', E'\n');
  v_updated_definition := replace(
    v_definition,
    E'if p_status = ''no_show'' and v_reason is null and not exists (\n    select 1\n    from public.boarding_bus_departures departure\n    where departure.allocation_id = v_allocation_id\n      and departure.cancelled_at is null\n      and departure.bus_id = v_bus_id\n  ) then\n    raise exception ''No-show status is available after bus departure.'';\n  end if;',
    E'if p_status = ''no_show'' and v_reason is null then\n    raise exception ''A no-show reason is required.'';\n  end if;'
  );
  if v_updated_definition = v_definition then
    raise exception 'Could not enforce the passenger no-show reason requirement.';
  end if;
  execute v_updated_definition;

  select pg_get_functiondef(
    'public.set_walk_in_boarding_status(uuid,text,text)'::regprocedure
  ) into v_definition;
  v_definition := replace(v_definition, E'\r\n', E'\n');
  v_updated_definition := replace(
    v_definition,
    E'if p_status = ''no_show'' and v_reason is null and not exists (\n    select 1 from public.boarding_bus_departures\n    where allocation_id = v_walk_in.allocation_id\n      and bus_id = v_walk_in.bus_id\n      and cancelled_at is null\n  ) then\n    raise exception ''No-show status is available after bus departure.'';\n  end if;',
    E'if p_status = ''no_show'' and v_reason is null then\n    raise exception ''A no-show reason is required.'';\n  end if;'
  );
  if v_updated_definition = v_definition then
    raise exception 'Could not enforce the walk-in no-show reason requirement.';
  end if;
  execute v_updated_definition;
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
