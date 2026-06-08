-- Allow the confirmation RPC to archive and delete stale allocation drafts atomically.

create or replace function public.lock_allocation_planning_writes()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if current_setting('app.allocation_confirmation_write', true) = 'on' then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;

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

notify pgrst, 'reload schema';
