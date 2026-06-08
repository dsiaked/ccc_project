-- Serialize confirmation transactions without blocking unrelated table writes.

do $$
declare
  v_function_definition text;
  v_updated_definition text;
begin
  select pg_get_functiondef(
    'public.save_confirmed_allocation_workspace(uuid,bigint,jsonb,integer,integer)'::regprocedure
  )
  into v_function_definition;

  v_updated_definition := replace(
    v_function_definition,
    E'lock table public.bus_allocations in share row exclusive mode;\n  lock table public.reservations in share row exclusive mode;',
    E'perform pg_advisory_xact_lock(hashtextextended(''allocation-confirmation'', 0));'
  );

  if v_updated_definition = v_function_definition then
    if position(
      'pg_advisory_xact_lock(hashtextextended(''allocation-confirmation'', 0))'
      in v_function_definition
    ) = 0 then
      raise exception 'Could not replace allocation confirmation table locks.';
    end if;
  else
    execute v_updated_definition;
  end if;
end;
$$;

revoke all on function public.save_confirmed_allocation_workspace(
  uuid, bigint, jsonb, integer, integer
) from public, anon;
grant execute on function public.save_confirmed_allocation_workspace(
  uuid, bigint, jsonb, integer, integer
) to authenticated;

notify pgrst, 'reload schema';
