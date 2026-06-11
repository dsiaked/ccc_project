-- Diagnostic step for the production signup failure.
-- The following migration restores the canonical trigger after isolation.

do $$
declare
  v_trigger record;
begin
  for v_trigger in
    select trigger_name
    from information_schema.triggers
    where event_object_schema = 'auth'
      and event_object_table = 'users'
  loop
    execute format(
      'drop trigger if exists %I on auth.users',
      v_trigger.trigger_name
    );
  end loop;
end;
$$;
