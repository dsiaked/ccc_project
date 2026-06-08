-- Lock allocation planning while a confirmed allocation exists.

create or replace function public.assert_allocation_planning_unlocked()
returns void language plpgsql security definer set search_path = public as $$
begin
  if current_setting('app.allocation_confirmation_write', true) = 'on' then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;

  if exists (
    select 1 from public.bus_allocations
    where allocation_data ->> 'status' = 'confirmed'
  ) then
    raise exception 'Cancel the confirmed allocation before using allocation planning.';
  end if;
end;
$$;

revoke all on function public.assert_allocation_planning_unlocked()
  from public, anon, authenticated;

create or replace function public.lock_allocation_planning_writes()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if exists (
    select 1 from public.bus_allocations
    where allocation_data ->> 'status' = 'confirmed'
  ) then
    if tg_op = 'UPDATE' and old.allocation_data ->> 'status' = 'confirmed' then
      return new;
    end if;
    raise exception 'Cancel the confirmed allocation before using allocation planning.';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

drop trigger if exists lock_allocation_planning_bus_writes on public.bus_allocations;
create trigger lock_allocation_planning_bus_writes
before insert or update or delete on public.bus_allocations
for each row execute function public.lock_allocation_planning_writes();

create or replace function public.lock_allocation_optimization_job_creation()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.assert_allocation_planning_unlocked();
  return new;
end;
$$;

drop trigger if exists lock_allocation_optimization_job_creation
  on public.allocation_optimization_jobs;
create trigger lock_allocation_optimization_job_creation
before insert on public.allocation_optimization_jobs
for each row execute function public.lock_allocation_optimization_job_creation();

do $$
begin
  if to_regprocedure(
    'public.save_confirmed_allocation_workspace_v3_unlocked(uuid,bigint,jsonb,integer,integer,text,text,jsonb)'
  ) is null then
    alter function public.save_confirmed_allocation_workspace_v3(
      uuid, bigint, jsonb, integer, integer, text, text, jsonb
    ) rename to save_confirmed_allocation_workspace_v3_unlocked;
  end if;
end;
$$;

revoke all on function public.save_confirmed_allocation_workspace_v3_unlocked(
  uuid, bigint, jsonb, integer, integer, text, text, jsonb
) from public, anon, authenticated;

create or replace function public.save_confirmed_allocation_workspace_v3(
  p_allocation_id uuid, p_expected_revision bigint, p_allocation_data jsonb,
  p_total_cost integer, p_total_capacity integer, p_version_id text,
  p_version_label text, p_version_changes jsonb
)
returns setof public.bus_allocations
language plpgsql security definer set search_path = public as $$
begin
  if exists (
    select 1 from public.bus_allocations
    where id = p_allocation_id and allocation_data ->> 'status' = 'confirmed'
  ) then
    raise exception 'Confirmed allocation is locked until confirmation is cancelled.';
  end if;

  perform set_config('app.allocation_confirmation_write', 'on', true);

  return query select *
  from public.save_confirmed_allocation_workspace_v3_unlocked(
    p_allocation_id, p_expected_revision, p_allocation_data, p_total_cost,
    p_total_capacity, p_version_id, p_version_label, p_version_changes
  );
end;
$$;

revoke all on function public.save_confirmed_allocation_workspace_v3(
  uuid, bigint, jsonb, integer, integer, text, text, jsonb
) from public, anon;
grant execute on function public.save_confirmed_allocation_workspace_v3(
  uuid, bigint, jsonb, integer, integer, text, text, jsonb
) to authenticated;

revoke execute on function public.save_confirmed_allocation_workspace(
  uuid, bigint, jsonb, integer, integer
) from authenticated;
revoke execute on function public.save_confirmed_allocation_workspace_v2(
  uuid, bigint, jsonb, integer, integer, text, text, jsonb
) from authenticated;

do $$
begin
  if to_regprocedure(
    'public.save_allocation_optimizer_config_unlocked(integer,integer,integer)'
  ) is null then
    alter function public.save_allocation_optimizer_config(integer, integer, integer)
      rename to save_allocation_optimizer_config_unlocked;
  end if;
end;
$$;

revoke all on function public.save_allocation_optimizer_config_unlocked(
  integer, integer, integer
) from public, anon, authenticated;

create or replace function public.save_allocation_optimizer_config(
  p_capacity integer,
  p_price integer,
  p_recommended_minimum_passengers integer
)
returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  perform public.assert_allocation_planning_unlocked();
  return public.save_allocation_optimizer_config_unlocked(
    p_capacity, p_price, p_recommended_minimum_passengers
  );
end;
$$;

revoke all on function public.save_allocation_optimizer_config(
  integer, integer, integer
) from public, anon;
grant execute on function public.save_allocation_optimizer_config(
  integer, integer, integer
) to authenticated;

notify pgrst, 'reload schema';
