-- Attribute simulated personal activity to the simulated user instead of the
-- administrator or service account that executes the simulation runner.

create or replace function public.audit_business_activity_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row jsonb;
  v_actor_id uuid := auth.uid();
  v_actor_kind text;
  v_subject_id_text text;
  v_subject_id uuid;
  v_is_simulation_user boolean := false;
begin
  v_row := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
  v_subject_id_text := case
    when tg_table_name = 'profiles' then v_row ->> 'id'
    else v_row ->> 'user_id'
  end;

  if v_subject_id_text ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    v_subject_id := v_subject_id_text::uuid;

    select exists (
      select 1
      from auth.users simulation_user
      where simulation_user.id = v_subject_id
        and lower(coalesce(simulation_user.email, '')) like '%@ccc-bus.test'
        and simulation_user.raw_user_meta_data ? 'sim_seq'
    )
    into v_is_simulation_user;
  end if;

  if v_is_simulation_user
     and tg_table_name in ('profiles', 'reservations', 'payments') then
    v_actor_id := v_subject_id;
    v_actor_kind := 'user';
  else
    v_actor_kind := case
      when v_actor_id is null then 'system'
      when exists (
        select 1
        from public.admin_roles admin_role
        where admin_role.user_id = v_actor_id
      ) then 'admin'
      else 'user'
    end;
  end if;

  insert into public.activity_event_logs (
    actor_id,
    actor_kind,
    event_name,
    category,
    metadata
  )
  values (
    v_actor_id,
    v_actor_kind,
    tg_table_name || '.' || lower(tg_op),
    'data_change',
    jsonb_strip_nulls(jsonb_build_object(
      'resource_type', tg_table_name,
      'resource_id', v_row ->> 'id',
      'outcome', coalesce(v_row ->> 'status', lower(tg_op)),
      'source', case when v_is_simulation_user then 'simulation' else null end
    ))
  );

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

revoke all on function public.audit_business_activity_event()
  from public, anon, authenticated;

drop trigger if exists audit_business_activity_event on public.profiles;
create trigger audit_business_activity_event
after insert or update or delete on public.profiles
for each row execute function public.audit_business_activity_event();
