-- =========================================================
-- Reset allocation optimization history and reusable result cache
-- =========================================================

create or replace function public.reset_allocation_optimization_jobs()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_deleted_count integer;
begin
  if auth.uid() is null or not public.is_global_admin() then
    raise exception 'Only global admins can reset allocation optimization jobs.';
  end if;

  if exists (
    select 1
    from public.allocation_optimization_jobs
    where status in ('PENDING', 'RUNNING', 'CANCEL_REQUESTED')
  ) then
    raise exception 'Cancel the active allocation optimization job before resetting.';
  end if;

  select count(*)::integer
  into v_deleted_count
  from public.allocation_optimization_jobs;

  delete from public.allocation_optimization_jobs;

  return v_deleted_count;
end;
$$;

revoke all on function public.reset_allocation_optimization_jobs()
  from public, anon;
grant execute on function public.reset_allocation_optimization_jobs()
  to authenticated;

notify pgrst, 'reload schema';
