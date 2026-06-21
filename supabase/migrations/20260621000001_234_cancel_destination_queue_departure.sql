-- Allow global administrators to undo an accidental destination-queue departure.

create or replace function public.cancel_destination_queue_departure(
  p_bus_id uuid,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_bus public.destination_queue_buses%rowtype;
  v_boarded_count integer;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_restored_status text;
  v_check_in_code text;
  v_before jsonb;
  v_after jsonb;
begin
  if not public.is_global_admin() then
    raise exception 'Only global admins can cancel destination queue departures.';
  end if;
  if v_reason is null then
    raise exception 'A cancellation reason is required.';
  end if;
  if char_length(v_reason) > 500 then
    raise exception 'The cancellation reason must be 500 characters or fewer.';
  end if;

  select *
  into v_bus
  from public.destination_queue_buses
  where id = p_bus_id
  for update;

  if not found then
    raise exception 'Bus not found.';
  end if;
  if v_bus.status <> 'departed' or v_bus.departed_at is null then
    raise exception 'Only departed buses can be cancelled.';
  end if;
  if exists (
    select 1
    from public.destination_queue_buses later_bus
    where later_bus.allocation_id = v_bus.allocation_id
      and later_bus.destination = v_bus.destination
      and later_bus.sequence_number > v_bus.sequence_number
  ) then
    raise exception 'Cancel later destination buses before cancelling this departure.';
  end if;

  select count(*)::integer
  into v_boarded_count
  from public.reservations reservation
  where reservation.confirmed_ticket ->> 'busId' = v_bus.id::text
    and reservation.confirmed_ticket ->> 'allocationStrategy' = 'destination_queue'
    and reservation.boarding_status = 'boarded';

  v_restored_status := case
    when v_boarded_count >= v_bus.capacity then 'full'
    else 'open'
  end;
  v_check_in_code := case
    when v_restored_status = 'open'
      then lpad(floor(random() * 10000)::integer::text, 4, '0')
    else null
  end;
  v_before := to_jsonb(v_bus);

  delete from public.destination_queue_departure_snapshots
  where bus_id = v_bus.id;

  update public.destination_queue_buses as restored_bus
  set
    status = v_restored_status,
    check_in_code = v_check_in_code,
    closed_at = case when v_restored_status = 'full' then closed_at else null end,
    departed_at = null,
    departed_by = null
  where id = v_bus.id
  returning to_jsonb(restored_bus) into v_after;

  insert into public.admin_action_audit_logs (
    actor_id,
    action,
    resource_type,
    resource_id,
    before_data,
    after_data
  )
  values (
    auth.uid(),
    'cancel_departure',
    'destination_queue_bus',
    v_bus.id,
    v_before,
    v_after || jsonb_build_object(
      'reason', v_reason,
      'boardedCount', v_boarded_count
    )
  );

  return jsonb_build_object(
    'busId', v_bus.id,
    'status', v_restored_status,
    'boardedCount', v_boarded_count,
    'checkInCode', v_check_in_code
  );
end;
$$;

revoke all on function public.cancel_destination_queue_departure(uuid, text)
from public, anon;

grant execute on function public.cancel_destination_queue_departure(uuid, text)
to authenticated, service_role;

create or replace function public.get_deployment_compatibility_version()
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select 234;
$$;

create or replace function public.assert_deployment_compatibility(
  p_required_version integer
)
returns integer
language plpgsql
stable
set search_path = public
as $$
declare
  v_deployed_version constant integer := 234;
begin
  if p_required_version > v_deployed_version then
    raise exception 'Database deployment version % is older than required version %.',
      v_deployed_version,
      p_required_version;
  end if;

  return v_deployed_version;
end;
$$;

revoke all on function public.get_deployment_compatibility_version() from public;
grant execute on function public.get_deployment_compatibility_version()
to anon, authenticated, service_role;

revoke all on function public.assert_deployment_compatibility(integer) from public;
grant execute on function public.assert_deployment_compatibility(integer)
to anon, authenticated, service_role;

notify pgrst, 'reload schema';
