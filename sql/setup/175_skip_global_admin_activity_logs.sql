-- Keep global administrators out of general activity logs.
-- Their management actions remain available in admin_action_audit_logs.

create or replace function public.record_activity_event(
  p_event_name text,
  p_category text default 'interaction',
  p_route text default null,
  p_metadata jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_metadata jsonb;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required.';
  end if;

  if exists (
    select 1
    from public.admin_roles admin_role
    where admin_role.user_id = auth.uid()
      and admin_role.role = 'global_admin'
  ) then
    return null;
  end if;

  if length(trim(coalesce(p_event_name, ''))) = 0
     or length(p_event_name) > 100 then
    raise exception 'Invalid event name.';
  end if;

  if length(trim(coalesce(p_category, ''))) = 0
     or length(p_category) > 50 then
    raise exception 'Invalid event category.';
  end if;

  select coalesce(jsonb_object_agg(item.key, item.value), '{}'::jsonb)
  into v_metadata
  from jsonb_each(coalesce(p_metadata, '{}'::jsonb)) item
  where item.key in (
    'source',
    'outcome',
    'duration_ms',
    'resource_type',
    'resource_id',
    'error_code',
    'page_title'
  );

  insert into public.activity_event_logs (
    actor_id,
    actor_kind,
    event_name,
    category,
    route,
    metadata
  )
  values (
    auth.uid(),
    case
      when exists (
        select 1
        from public.admin_roles admin_role
        where admin_role.user_id = auth.uid()
      ) then 'admin'
      else 'user'
    end,
    trim(p_event_name),
    trim(p_category),
    left(nullif(trim(coalesce(p_route, '')), ''), 300),
    v_metadata
  )
  returning id into v_id;

  return v_id;
end;
$$;

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
    if exists (
      select 1
      from public.admin_roles admin_role
      where admin_role.user_id = v_actor_id
        and admin_role.role = 'global_admin'
    ) then
      return case when tg_op = 'DELETE' then old else new end;
    end if;

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

delete from public.activity_event_logs activity
using public.admin_roles admin_role
where activity.actor_id = admin_role.user_id
  and admin_role.role = 'global_admin';

notify pgrst, 'reload schema';
