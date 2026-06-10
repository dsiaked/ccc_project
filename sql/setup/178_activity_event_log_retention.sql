-- =========================================================
-- Retain privacy-safe activity logs for 90 days
-- =========================================================

create or replace function public.prune_activity_event_logs()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_deleted_count integer;
begin
  delete from public.activity_event_logs activity
  where activity.occurred_at < now() - interval '90 days';

  get diagnostics v_deleted_count = row_count;
  return v_deleted_count;
end;
$$;

revoke all on function public.prune_activity_event_logs()
  from public, anon, authenticated;
grant execute on function public.prune_activity_event_logs()
  to service_role;

create or replace function public.prune_activity_event_logs_daily()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_last_pruned_on date;
begin
  if not pg_try_advisory_xact_lock(hashtext('activity_event_logs_retention')) then
    return null;
  end if;

  select nullif(value ->> 'last_pruned_on', '')::date
  into v_last_pruned_on
  from public.app_settings
  where key = 'activity_event_log_retention';

  if v_last_pruned_on is not null and v_last_pruned_on >= current_date then
    return null;
  end if;

  insert into public.app_settings (key, value, updated_at)
  values (
    'activity_event_log_retention',
    jsonb_build_object('last_pruned_on', current_date),
    now()
  )
  on conflict (key) do update
  set
    value = excluded.value,
    updated_at = excluded.updated_at;

  perform public.prune_activity_event_logs();
  return null;
end;
$$;

revoke all on function public.prune_activity_event_logs_daily()
  from public, anon, authenticated;

drop trigger if exists prune_activity_event_logs_daily
  on public.activity_event_logs;
create trigger prune_activity_event_logs_daily
after insert on public.activity_event_logs
for each statement execute function public.prune_activity_event_logs_daily();

notify pgrst, 'reload schema';
