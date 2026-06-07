-- =========================================================
-- Atomic allocation confirmation and cancellation
-- Run after 52_fix_bus_allocations_policies.sql.
-- =========================================================

create index if not exists idx_bus_allocations_status
  on public.bus_allocations ((allocation_data ->> 'status'));

create or replace function public.get_draft_allocation_summaries()
returns table (
  id uuid,
  allocation_name text,
  total_cost integer,
  total_capacity integer,
  created_at timestamptz,
  bus_count integer,
  passenger_count integer
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_global_admin() then
    raise exception 'Only global admins can view allocation summaries.';
  end if;

  return query
  select
    allocation.id,
    allocation.allocation_name,
    allocation.total_cost,
    allocation.total_capacity,
    allocation.created_at,
    case
      when jsonb_typeof(allocation.allocation_data -> 'buses') = 'array'
        then jsonb_array_length(allocation.allocation_data -> 'buses')
      else 0
    end as bus_count,
    case
      when jsonb_typeof(allocation.allocation_data -> 'passengers') = 'array'
        then jsonb_array_length(allocation.allocation_data -> 'passengers')
      else 0
    end as passenger_count
  from public.bus_allocations allocation
  where allocation.allocation_data ->> 'status' = 'draft'
  order by allocation.created_at desc;
end;
$$;

create or replace function public.validate_allocation_workspace_confirmation(
  p_allocation_id uuid,
  p_allocation_data jsonb
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_allocation_status text;
  v_passenger_count integer := 0;
  v_active_reservation_count integer := 0;
  v_payload_valid boolean;
  v_workspace_valid boolean;
  v_bus_details_valid boolean;
  v_assignments_valid boolean;
  v_unique_reservations_valid boolean;
  v_unique_seats_valid boolean;
  v_active_reservations_valid boolean;
begin
  if auth.uid() is null or not public.is_global_admin() then
    raise exception 'Only global admins can validate allocations.';
  end if;

  select allocation_data ->> 'status'
  into v_allocation_status
  from public.bus_allocations
  where id = p_allocation_id;

  v_payload_valid := coalesce(
    jsonb_typeof(p_allocation_data) = 'object'
    and jsonb_typeof(p_allocation_data -> 'buses') = 'array'
    and jsonb_array_length(p_allocation_data -> 'buses') > 0
    and jsonb_typeof(p_allocation_data -> 'passengers') = 'array'
    and jsonb_array_length(p_allocation_data -> 'passengers') > 0,
    false
  );
  v_workspace_valid := coalesce(
    v_allocation_status in ('draft', 'confirmed'),
    false
  );

  select count(*)
  into v_active_reservation_count
  from public.reservations
  where status is distinct from 'cancelled';

  if not v_payload_valid then
    return jsonb_build_object(
      'valid', false,
      'checked_at', clock_timestamp(),
      'allocation_status', v_allocation_status,
      'passenger_count', 0,
      'active_reservation_count', v_active_reservation_count,
      'checks', jsonb_build_array(
        jsonb_build_object('key', 'workspace_status', 'valid', v_workspace_valid),
        jsonb_build_object('key', 'payload_structure', 'valid', false),
        jsonb_build_object('key', 'bus_details', 'valid', false),
        jsonb_build_object('key', 'assignments', 'valid', false),
        jsonb_build_object('key', 'unique_reservations', 'valid', false),
        jsonb_build_object('key', 'unique_seats', 'valid', false),
        jsonb_build_object('key', 'active_reservations', 'valid', false)
      )
    );
  end if;

  v_passenger_count := jsonb_array_length(p_allocation_data -> 'passengers');

  v_bus_details_valid := not exists (
    select 1
    from jsonb_array_elements(p_allocation_data -> 'buses') bus
    where nullif(btrim(bus ->> 'id'), '') is null
      or nullif(btrim(bus ->> 'label'), '') is null
      or nullif(btrim(bus ->> 'destination'), '') is null
      or nullif(btrim(bus ->> 'departureTime'), '') is null
      or nullif(btrim(bus ->> 'boardingPlace'), '') is null
      or coalesce(bus ->> 'capacity', '') !~ '^[1-9][0-9]*$'
  );

  v_assignments_valid := not exists (
    select 1
    from jsonb_array_elements(p_allocation_data -> 'passengers') passenger
    left join jsonb_array_elements(p_allocation_data -> 'buses') bus
      on bus ->> 'id' = passenger ->> 'busId'
    where nullif(passenger ->> 'reservationId', '') is null
      or nullif(passenger ->> 'busId', '') is null
      or coalesce(passenger ->> 'seatNumber', '') !~ '^[1-9][0-9]*$'
      or bus is null
      or case
        when coalesce(passenger ->> 'seatNumber', '') ~ '^[1-9][0-9]*$'
          and coalesce(bus ->> 'capacity', '') ~ '^[1-9][0-9]*$'
          then (passenger ->> 'seatNumber')::integer > (bus ->> 'capacity')::integer
        else true
      end
      or not (
        coalesce(passenger -> 'preferences', '[]'::jsonb)
          ? (bus ->> 'destination')
      )
  );

  v_unique_reservations_valid := (
    select count(distinct passenger ->> 'reservationId')
    from jsonb_array_elements(p_allocation_data -> 'passengers') passenger
  ) = v_passenger_count;

  v_unique_seats_valid := not exists (
    select 1
    from jsonb_array_elements(p_allocation_data -> 'passengers') passenger
    group by passenger ->> 'busId', passenger ->> 'seatNumber'
    having count(*) > 1
  );

  v_active_reservations_valid :=
    v_active_reservation_count = v_passenger_count
    and not exists (
      select 1
      from public.reservations reservation
      where reservation.status is distinct from 'cancelled'
        and not exists (
          select 1
          from jsonb_array_elements(p_allocation_data -> 'passengers') passenger
          where passenger ->> 'reservationId' = reservation.id::text
        )
    )
    and not exists (
      select 1
      from jsonb_array_elements(p_allocation_data -> 'passengers') passenger
      where not exists (
        select 1
        from public.reservations reservation
        where reservation.id::text = passenger ->> 'reservationId'
          and reservation.status is distinct from 'cancelled'
      )
    );

  return jsonb_build_object(
    'valid',
      v_workspace_valid
      and v_payload_valid
      and v_bus_details_valid
      and v_assignments_valid
      and v_unique_reservations_valid
      and v_unique_seats_valid
      and v_active_reservations_valid,
    'checked_at', clock_timestamp(),
    'allocation_status', v_allocation_status,
    'passenger_count', v_passenger_count,
    'active_reservation_count', v_active_reservation_count,
    'checks', jsonb_build_array(
      jsonb_build_object('key', 'workspace_status', 'valid', v_workspace_valid),
      jsonb_build_object('key', 'payload_structure', 'valid', v_payload_valid),
      jsonb_build_object('key', 'bus_details', 'valid', v_bus_details_valid),
      jsonb_build_object('key', 'assignments', 'valid', v_assignments_valid),
      jsonb_build_object('key', 'unique_reservations', 'valid', v_unique_reservations_valid),
      jsonb_build_object('key', 'unique_seats', 'valid', v_unique_seats_valid),
      jsonb_build_object('key', 'active_reservations', 'valid', v_active_reservations_valid)
    )
  );
end;
$$;

create or replace function public.save_confirmed_allocation_workspace(
  p_allocation_id uuid,
  p_allocation_data jsonb,
  p_total_cost integer,
  p_total_capacity integer
)
returns setof public.bus_allocations
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_actor_id uuid := auth.uid();
  v_current_status text;
  v_passenger_count integer;
  v_updated_count integer;
begin
  if v_actor_id is null or not public.is_global_admin() then
    raise exception 'Only global admins can confirm allocations.';
  end if;

  if jsonb_typeof(p_allocation_data) <> 'object'
    or jsonb_typeof(p_allocation_data -> 'buses') <> 'array'
    or jsonb_typeof(p_allocation_data -> 'passengers') <> 'array'
    or p_allocation_data ->> 'status' <> 'confirmed' then
    raise exception 'Invalid confirmed allocation payload.';
  end if;

  lock table public.bus_allocations in share row exclusive mode;
  lock table public.reservations in share row exclusive mode;

  select allocation_data ->> 'status'
  into v_current_status
  from public.bus_allocations
  where id = p_allocation_id
  for update;

  if v_current_status is null or v_current_status not in ('draft', 'confirmed') then
    raise exception 'Only draft or confirmed allocations can be saved as confirmed.';
  end if;

  v_passenger_count := jsonb_array_length(p_allocation_data -> 'passengers');

  if v_passenger_count = 0
    or jsonb_array_length(p_allocation_data -> 'buses') = 0 then
    raise exception 'Confirmed allocations need at least one bus and passenger.';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_allocation_data -> 'buses') bus
    where nullif(btrim(bus ->> 'id'), '') is null
      or nullif(btrim(bus ->> 'label'), '') is null
      or nullif(btrim(bus ->> 'destination'), '') is null
      or nullif(btrim(bus ->> 'departureTime'), '') is null
      or nullif(btrim(bus ->> 'boardingPlace'), '') is null
      or coalesce(bus ->> 'capacity', '') !~ '^[1-9][0-9]*$'
  ) then
    raise exception 'Every bus needs valid required details.';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_allocation_data -> 'passengers') passenger
    where nullif(passenger ->> 'reservationId', '') is null
      or nullif(passenger ->> 'busId', '') is null
      or coalesce(passenger ->> 'seatNumber', '') !~ '^[1-9][0-9]*$'
  ) then
    raise exception 'Every passenger needs a bus and valid seat number.';
  end if;

  if (
    select count(distinct passenger ->> 'reservationId')
    from jsonb_array_elements(p_allocation_data -> 'passengers') passenger
  ) <> v_passenger_count then
    raise exception 'Duplicate reservation IDs exist in the allocation.';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_allocation_data -> 'passengers') passenger
    left join jsonb_array_elements(p_allocation_data -> 'buses') bus
      on bus ->> 'id' = passenger ->> 'busId'
    where bus is null
      or (passenger ->> 'seatNumber')::integer > (bus ->> 'capacity')::integer
      or not (
        coalesce(passenger -> 'preferences', '[]'::jsonb)
          ? (bus ->> 'destination')
      )
  ) then
    raise exception 'Invalid bus, seat, or destination assignment exists.';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_allocation_data -> 'passengers') passenger
    group by passenger ->> 'busId', passenger ->> 'seatNumber'
    having count(*) > 1
  ) then
    raise exception 'Duplicate seat assignments exist.';
  end if;

  if (
    select count(*)
    from public.reservations
    where status is distinct from 'cancelled'
  ) <> v_passenger_count
    or exists (
      select 1
      from public.reservations reservation
      where reservation.status is distinct from 'cancelled'
        and not exists (
          select 1
          from jsonb_array_elements(p_allocation_data -> 'passengers') passenger
          where passenger ->> 'reservationId' = reservation.id::text
        )
    )
    or exists (
      select 1
      from jsonb_array_elements(p_allocation_data -> 'passengers') passenger
      where not exists (
        select 1
        from public.reservations reservation
        where reservation.id = (passenger ->> 'reservationId')::uuid
          and reservation.status is distinct from 'cancelled'
      )
    ) then
    raise exception 'Active reservations changed after the draft was created.';
  end if;

  with assignments as (
    select
      (passenger ->> 'reservationId')::uuid as reservation_id,
      jsonb_build_object(
        'busNumber', bus ->> 'label',
        'seatNumber', passenger ->> 'seatNumber',
        'departureTime', bus ->> 'departureTime',
        'boardingPlace', bus ->> 'boardingPlace',
        'dropoffStation', bus ->> 'destination',
        'confirmedAt', v_now::text
      ) as ticket
    from jsonb_array_elements(p_allocation_data -> 'passengers') passenger
    join jsonb_array_elements(p_allocation_data -> 'buses') bus
      on bus ->> 'id' = passenger ->> 'busId'
  )
  update public.reservations reservation
  set
    status = 'confirmed',
    confirmed_ticket = assignments.ticket,
    data = coalesce(reservation.data, '{}'::jsonb) || jsonb_build_object(
      'status', 'confirmed',
      'confirmedTicket', assignments.ticket,
      'updatedAt', v_now::text
    ),
    updated_at = v_now
  from assignments
  where reservation.id = assignments.reservation_id
    and reservation.status is distinct from 'cancelled';

  get diagnostics v_updated_count = row_count;
  if v_updated_count <> v_passenger_count then
    raise exception 'Not every active reservation was confirmed.';
  end if;

  update public.bus_allocations
  set
    allocation_data = p_allocation_data,
    total_cost = p_total_cost,
    total_capacity = p_total_capacity
  where id = p_allocation_id;

  if v_current_status = 'draft' then
    update public.bus_allocations allocation
    set allocation_data =
      jsonb_set(
        jsonb_set(
          jsonb_set(
            allocation.allocation_data,
            '{status}',
            to_jsonb('archived'::text),
            true
          ),
          '{passengers}',
          coalesce(
            (
              select jsonb_agg(
                passenger.value || jsonb_build_object(
                  'reservationId', 'anonymous-' || passenger.ordinality,
                  'name', '승객 A-' || lpad(passenger.ordinality::text, 3, '0'),
                  'campus', '',
                  'team', ''
                )
                order by passenger.ordinality
              )
              from jsonb_array_elements(allocation.allocation_data -> 'passengers')
                with ordinality passenger(value, ordinality)
            ),
            '[]'::jsonb
          ),
          true
        ),
        '{versions}',
        '[]'::jsonb,
        true
      ) || jsonb_build_object(
        'history',
        coalesce(allocation.allocation_data -> 'history', '[]'::jsonb)
          || jsonb_build_array(jsonb_build_object(
            'id', 'history-' || floor(extract(epoch from v_now) * 1000)::bigint
              || '-' || substr(md5(random()::text), 1, 7),
            'at', v_now::text,
            'actorId', v_actor_id::text,
            'action', 'archived',
            'detail', '새 배차 확정에 따라 승객 정보를 익명화하고 과거 기록으로 보관했습니다.'
          ))
      )
    where allocation.id <> p_allocation_id
      and allocation.allocation_data ->> 'status' = 'confirmed';

    delete from public.bus_allocations allocation
    where allocation.id <> p_allocation_id
      and allocation.allocation_data ->> 'status' = 'draft';
  end if;

  return query
  select *
  from public.bus_allocations
  where id = p_allocation_id;
end;
$$;

create or replace function public.cancel_confirmed_allocation_workspace(
  p_allocation_id uuid,
  p_allocation_data jsonb,
  p_total_cost integer,
  p_total_capacity integer
)
returns setof public.bus_allocations
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_actor_id uuid := auth.uid();
  v_current_status text;
begin
  if v_actor_id is null or not public.is_global_admin() then
    raise exception 'Only global admins can cancel confirmed allocations.';
  end if;

  if jsonb_typeof(p_allocation_data) <> 'object'
    or p_allocation_data ->> 'status' <> 'draft' then
    raise exception 'Invalid draft allocation payload.';
  end if;

  lock table public.bus_allocations in share row exclusive mode;
  lock table public.reservations in share row exclusive mode;

  select allocation_data ->> 'status'
  into v_current_status
  from public.bus_allocations
  where id = p_allocation_id
  for update;

  if v_current_status is null or v_current_status <> 'confirmed' then
    raise exception 'Only confirmed allocations can be cancelled.';
  end if;

  update public.reservations reservation
  set
    status = 'requested',
    confirmed_ticket = null,
    data = (coalesce(reservation.data, '{}'::jsonb) - 'confirmedTicket')
      || jsonb_build_object(
        'status', 'requested',
        'updatedAt', v_now::text
      ),
    updated_at = v_now
  where reservation.status is distinct from 'cancelled';

  update public.bus_allocations
  set
    allocation_data = p_allocation_data,
    total_cost = p_total_cost,
    total_capacity = p_total_capacity
  where id = p_allocation_id;

  return query
  select *
  from public.bus_allocations
  where id = p_allocation_id;
end;
$$;

revoke all on function public.save_confirmed_allocation_workspace(
  uuid, jsonb, integer, integer
) from public, anon;
grant execute on function public.save_confirmed_allocation_workspace(
  uuid, jsonb, integer, integer
) to authenticated;

revoke all on function public.cancel_confirmed_allocation_workspace(
  uuid, jsonb, integer, integer
) from public, anon;
grant execute on function public.cancel_confirmed_allocation_workspace(
  uuid, jsonb, integer, integer
) to authenticated;

revoke all on function public.get_draft_allocation_summaries() from public, anon;
grant execute on function public.get_draft_allocation_summaries() to authenticated;

revoke all on function public.validate_allocation_workspace_confirmation(
  uuid, jsonb
) from public, anon;
grant execute on function public.validate_allocation_workspace_confirmation(
  uuid, jsonb
) to authenticated;

notify pgrst, 'reload schema';
