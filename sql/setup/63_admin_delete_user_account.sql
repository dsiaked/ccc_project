-- =========================================================
-- Delete one application user as a global admin
-- Run this in Supabase SQL Editor.
-- =========================================================

create or replace function public.delete_user_account_as_admin(
  p_user_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_actor_id uuid := auth.uid();
  v_reservation_ids text[];
  v_allocation public.bus_allocations%rowtype;
begin
  if v_actor_id is null or not public.is_global_admin() then
    raise exception 'Only global admins can delete user accounts.';
  end if;

  if p_user_id is null then
    raise exception 'A user ID is required.';
  end if;

  if p_user_id = v_actor_id then
    raise exception 'The currently signed-in account cannot be deleted.';
  end if;

  perform 1
  from auth.users
  where id = p_user_id
  for update;

  if not found then
    return false;
  end if;

  if exists (
    select 1
    from public.admin_roles
    where user_id = p_user_id
      and role = 'global_admin'
  ) then
    raise exception 'Global admin accounts cannot be deleted.';
  end if;

  select coalesce(array_agg(id::text), array[]::text[])
  into v_reservation_ids
  from public.reservations
  where user_id = p_user_id;

  for v_allocation in
    select allocation.*
    from public.bus_allocations allocation
    where allocation.allocation_data ->> 'status' = 'confirmed'
      and exists (
        select 1
        from jsonb_array_elements(
          coalesce(allocation.allocation_data -> 'passengers', '[]'::jsonb)
        ) passenger
        where passenger ->> 'reservationId' = any(v_reservation_ids)
      )
    for update
  loop
    update public.bus_allocations
    set
      allocation_data = jsonb_set(
        jsonb_set(
          v_allocation.allocation_data,
          '{passengers}',
          coalesce((
            select jsonb_agg(passenger.value order by passenger.ordinality)
            from jsonb_array_elements(
              coalesce(v_allocation.allocation_data -> 'passengers', '[]'::jsonb)
            )
              with ordinality passenger(value, ordinality)
            where not (passenger.value ->> 'reservationId' = any(v_reservation_ids))
          ), '[]'::jsonb),
          true
        ),
        '{history}',
        coalesce(v_allocation.allocation_data -> 'history', '[]'::jsonb)
          || jsonb_build_array(jsonb_build_object(
            'id', 'history-' || gen_random_uuid()::text,
            'at', v_now::text,
            'actorId', v_actor_id::text,
            'action', 'user_account_deleted',
            'detail', 'Deleted user was removed from the confirmed allocation.'
          )),
        true
      ),
      updated_at = v_now,
      revision = revision + 1
    where id = v_allocation.id;
  end loop;

  update public.payments
  set verified_by = null
  where verified_by = p_user_id;

  update public.bus_allocations
  set created_by = null
  where created_by = p_user_id;

  update public.admin_roles
  set granted_by = null
  where granted_by = p_user_id;

  update public.campus_transfers
  set
    sent_by = case when sent_by = p_user_id then null else sent_by end,
    confirmed_by = case when confirmed_by = p_user_id then null else confirmed_by end
  where sent_by = p_user_id
    or confirmed_by = p_user_id;

  update public.campus_requests
  set handled_by = null
  where handled_by = p_user_id;

  delete from public.campus_requests
  where created_by = p_user_id;

  delete from public.campus_request_messages
  where sender_id = p_user_id;

  if to_regclass('public.simulation_stage_runs') is not null then
    execute 'delete from public.simulation_stage_runs where requested_by = $1'
      using p_user_id;
  end if;

  delete from auth.users
  where id = p_user_id;

  return found;
end;
$$;

revoke all on function public.delete_user_account_as_admin(uuid)
from public, anon;
grant execute on function public.delete_user_account_as_admin(uuid)
to authenticated;

notify pgrst, 'reload schema';
