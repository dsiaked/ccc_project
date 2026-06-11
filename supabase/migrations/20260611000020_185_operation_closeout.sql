-- Record operation closeout without locking any existing correction workflow.

insert into public.app_settings (key, value)
values ('operation_closeout', '{"closed":false}'::jsonb)
on conflict (key) do nothing;

create or replace function public.get_operation_closeout()
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_value jsonb;
begin
  if not public.is_global_admin() then
    raise exception 'Only global admins can view operation closeout.';
  end if;

  select value into v_value
  from public.app_settings
  where key = 'operation_closeout';

  return coalesce(v_value, '{"closed":false}'::jsonb);
end;
$$;

create or replace function public.update_operation_closeout(
  p_closed boolean,
  p_reason text
)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_before jsonb;
  v_after jsonb;
  v_actor_name text;
begin
  if not public.is_global_admin() then
    raise exception 'Only global admins can update operation closeout.';
  end if;
  if nullif(trim(coalesce(p_reason, '')), '') is null then
    raise exception 'A closeout reason is required.';
  end if;

  select value into v_before
  from public.app_settings
  where key = 'operation_closeout'
  for update;

  select coalesce(nullif(trim(profile.name), ''), profile.email, '관리자')
  into v_actor_name
  from public.profiles profile
  where profile.id = auth.uid();

  if p_closed then
    v_after := jsonb_build_object(
      'closed', true,
      'closed_at', clock_timestamp(),
      'closed_by', auth.uid(),
      'closed_by_name', coalesce(v_actor_name, '관리자'),
      'reason', trim(p_reason),
      'reopened_at', null,
      'reopened_by', null,
      'reopened_by_name', null
    );
  else
    v_after := jsonb_build_object(
      'closed', false,
      'closed_at', v_before -> 'closed_at',
      'closed_by', v_before -> 'closed_by',
      'closed_by_name', v_before -> 'closed_by_name',
      'reason', trim(p_reason),
      'reopened_at', clock_timestamp(),
      'reopened_by', auth.uid(),
      'reopened_by_name', coalesce(v_actor_name, '관리자')
    );
  end if;

  insert into public.app_settings (key, value, updated_at)
  values ('operation_closeout', v_after, clock_timestamp())
  on conflict (key) do update
  set value = excluded.value, updated_at = excluded.updated_at;

  insert into public.admin_action_audit_logs (
    actor_id, action, resource_type, resource_id, before_data, after_data
  )
  values (
    auth.uid(), 'update', 'operation_closeout', null,
    coalesce(v_before, '{"closed":false}'::jsonb), v_after
  );

  return v_after;
end;
$$;

revoke all on function public.get_operation_closeout() from public, anon;
revoke all on function public.update_operation_closeout(boolean, text) from public, anon;
grant execute on function public.get_operation_closeout() to authenticated;
grant execute on function public.update_operation_closeout(boolean, text) to authenticated;

notify pgrst, 'reload schema';
