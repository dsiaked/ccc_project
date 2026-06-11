-- Keep high-risk public RPC authorization independent from nested helper behavior.

create or replace function public.bulk_manage_personal_user_payments(
  p_reservation_ids uuid[],
  p_status text,
  p_reason text
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_count integer := 0;
begin
  if not public.is_global_admin() then
    raise exception 'Only global admins can manage personal payments.';
  end if;

  if coalesce(array_length(p_reservation_ids, 1), 0) > 100 then
    raise exception 'Bulk operation is limited to 100 users.';
  end if;

  foreach v_id in array coalesce(p_reservation_ids, array[]::uuid[]) loop
    perform public.manage_personal_user_payment(v_id, p_status, p_reason);
    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

create or replace function public.bulk_send_personal_notifications(
  p_target_user_ids uuid[],
  p_title text,
  p_content text,
  p_category text default 'admin',
  p_reason text default null
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_count integer := 0;
begin
  if not public.is_global_admin() then
    raise exception 'Only global admins can send personal notifications.';
  end if;

  if coalesce(array_length(p_target_user_ids, 1), 0) > 100 then
    raise exception 'Bulk operation is limited to 100 users.';
  end if;

  foreach v_id in array coalesce(p_target_user_ids, array[]::uuid[]) loop
    perform public.send_personal_notification(
      v_id,
      p_title,
      p_content,
      p_category,
      p_reason
    );
    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

create or replace function public.create_allocation_optimization_job_for_execution(
  p_execution_mode text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_job_id uuid;
begin
  if not public.is_global_admin() then
    raise exception 'Only global admins can create allocation optimization jobs.';
  end if;

  if p_execution_mode not in ('local', 'cloud') then
    raise exception 'Allocation optimization execution mode is invalid.';
  end if;

  v_job_id := public.create_allocation_optimization_job();

  update public.allocation_optimization_jobs
  set execution_mode = p_execution_mode
  where id = v_job_id;

  insert into public.allocation_optimization_events (job_id, event_type, detail)
  values (
    v_job_id,
    'EXECUTION_MODE_SELECTED',
    jsonb_build_object('execution_mode', p_execution_mode)
  );

  return v_job_id;
end;
$$;

create or replace function public.create_detailed_allocation_optimization_job_for_execution(
  p_source_job_id uuid,
  p_skipped_phases text[],
  p_resume_from_job_id uuid,
  p_execution_mode text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_job_id uuid;
begin
  if not public.is_global_admin() then
    raise exception 'Only global admins can create allocation optimization jobs.';
  end if;

  if p_execution_mode not in ('local', 'cloud') then
    raise exception 'Allocation optimization execution mode is invalid.';
  end if;

  v_job_id := public.create_detailed_allocation_optimization_job(
    p_source_job_id,
    p_skipped_phases,
    p_resume_from_job_id
  );

  update public.allocation_optimization_jobs
  set execution_mode = p_execution_mode
  where id = v_job_id;

  insert into public.allocation_optimization_events (job_id, event_type, detail)
  values (
    v_job_id,
    'EXECUTION_MODE_SELECTED',
    jsonb_build_object('execution_mode', p_execution_mode)
  );

  return v_job_id;
end;
$$;

revoke all on function public.bulk_manage_personal_user_payments(uuid[], text, text)
  from public, anon;
revoke all on function public.bulk_send_personal_notifications(uuid[], text, text, text, text)
  from public, anon;
revoke all on function public.create_allocation_optimization_job_for_execution(text)
  from public, anon;
revoke all on function public.create_detailed_allocation_optimization_job_for_execution(
  uuid, text[], uuid, text
)
  from public, anon;

grant execute on function public.bulk_manage_personal_user_payments(uuid[], text, text)
  to authenticated;
grant execute on function public.bulk_send_personal_notifications(uuid[], text, text, text, text)
  to authenticated;
grant execute on function public.create_allocation_optimization_job_for_execution(text)
  to authenticated;
grant execute on function public.create_detailed_allocation_optimization_job_for_execution(
  uuid, text[], uuid, text
)
  to authenticated;

notify pgrst, 'reload schema';
