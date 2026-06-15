-- Allow boarding administrators to create scoped manual exception records.

create table if not exists public.manual_boarding_exception_records (
  id uuid primary key default gen_random_uuid(),
  allocation_id uuid not null references public.bus_allocations(id) on delete cascade,
  bus_id text not null,
  reservation_id uuid references public.reservations(id) on delete set null,
  passenger_name text,
  passenger_phone text,
  campus text,
  seat_number text,
  reason text not null,
  created_at timestamptz not null default clock_timestamp(),
  created_by uuid not null references auth.users(id) on delete restrict
);

create index if not exists idx_manual_boarding_exception_records_scope
  on public.manual_boarding_exception_records(allocation_id, bus_id, created_at desc);

alter table public.manual_boarding_exception_records enable row level security;
revoke all on public.manual_boarding_exception_records from public, anon, authenticated;

create or replace function public.get_manual_boarding_exception_records()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_boarding_manager() then
    raise exception 'Only boarding administrators can view manual boarding exception records';
  end if;

  return coalesce(
    (
      select jsonb_agg(
        jsonb_build_object(
          'id', record.id,
          'allocationId', record.allocation_id,
          'busId', record.bus_id,
          'reservationId', record.reservation_id,
          'passengerName', record.passenger_name,
          'passengerPhone', record.passenger_phone,
          'campus', record.campus,
          'seatNumber', record.seat_number,
          'reason', record.reason,
          'createdAt', record.created_at,
          'createdByName', coalesce(actor.name, '탑승 관리자')
        )
        order by record.created_at desc
      )
      from public.manual_boarding_exception_records record
      left join public.profiles actor on actor.id = record.created_by
      where public.can_manage_boarding_bus(record.allocation_id, record.bus_id)
    ),
    '[]'::jsonb
  );
end;
$$;

create or replace function public.create_manual_boarding_exception_record(
  p_allocation_id uuid,
  p_bus_id text,
  p_reservation_id uuid,
  p_reason text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reservation public.reservations%rowtype;
  v_record_id uuid;
  v_bus_label text;
begin
  if not public.is_boarding_manager() then
    raise exception 'Only boarding administrators can create manual boarding exception records';
  end if;
  if nullif(btrim(coalesce(p_bus_id, '')), '') is null
    or nullif(btrim(coalesce(p_reason, '')), '') is null then
    raise exception 'A bus and reason are required';
  end if;
  if not public.can_manage_boarding_bus(p_allocation_id, p_bus_id) then
    raise exception 'You are not assigned to this bus';
  end if;

  select bus ->> 'label' into v_bus_label
  from public.bus_allocations allocation
  cross join lateral jsonb_array_elements(allocation.allocation_data -> 'buses') bus
  where allocation.id = p_allocation_id
    and bus ->> 'id' = p_bus_id;
  if v_bus_label is null then
    raise exception 'The selected bus does not exist in this allocation';
  end if;

  if p_reservation_id is not null then
    select * into v_reservation
    from public.reservations reservation
    where reservation.id = p_reservation_id
      and public.get_confirmed_ticket_bus_id(
        reservation.id, reservation.confirmed_ticket
      ) = p_bus_id
      and exists (
        select 1
        from public.bus_allocations allocation
        cross join lateral jsonb_array_elements(
          allocation.allocation_data -> 'passengers'
        ) passenger
        where allocation.id = p_allocation_id
          and passenger ->> 'reservationId' = reservation.id::text
          and passenger ->> 'busId' = p_bus_id
      );
    if not found then
      raise exception 'The selected passenger does not belong to this bus';
    end if;
  end if;

  insert into public.manual_boarding_exception_records (
    allocation_id, bus_id, reservation_id, passenger_name, passenger_phone,
    campus, seat_number, reason, created_by
  ) values (
    p_allocation_id,
    p_bus_id,
    p_reservation_id,
    case when p_reservation_id is null then null else v_reservation.name end,
    case when p_reservation_id is null then null else v_reservation.phone end,
    case when p_reservation_id is null then null else v_reservation.campus end,
    case when p_reservation_id is null then null else v_reservation.confirmed_ticket ->> 'seatNumber' end,
    btrim(p_reason),
    auth.uid()
  )
  returning id into v_record_id;

  return v_record_id;
end;
$$;

create or replace function public.update_boarding_exception_reason(
  p_record_key text,
  p_allocation_id uuid,
  p_bus_id text,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_previous_reason text;
begin
  if not public.is_boarding_manager() then
    raise exception 'Only boarding administrators can update boarding exception reasons';
  end if;
  if nullif(btrim(coalesce(p_record_key, '')), '') is null
    or nullif(btrim(coalesce(p_bus_id, '')), '') is null
    or nullif(btrim(coalesce(p_reason, '')), '') is null then
    raise exception 'A boarding exception record and reason are required';
  end if;
  if not public.can_manage_boarding_bus(p_allocation_id, p_bus_id) then
    raise exception 'You are not assigned to this bus';
  end if;
  if not (
    (
      p_record_key like p_allocation_id::text || ':walk-in:%'
      and exists (
        select 1 from public.boarding_walk_in_passengers walk_in
        where walk_in.id::text = split_part(p_record_key, ':walk-in:', 2)
          and walk_in.allocation_id = p_allocation_id
          and walk_in.bus_id = p_bus_id
      )
    )
    or (
      p_record_key like p_allocation_id::text || ':event:%'
      and exists (
        select 1
        from public.boarding_status_events event
        join public.reservations reservation on reservation.id = event.reservation_id
        where event.id::text = split_part(p_record_key, ':event:', 2)
          and public.get_confirmed_ticket_bus_id(
            reservation.id, reservation.confirmed_ticket
          ) = p_bus_id
          and exists (
            select 1
            from public.bus_allocations allocation
            cross join lateral jsonb_array_elements(
              allocation.allocation_data -> 'passengers'
            ) passenger
            where allocation.id = p_allocation_id
              and passenger ->> 'reservationId' = reservation.id::text
              and passenger ->> 'busId' = p_bus_id
          )
      )
    )
    or (
      p_record_key like p_allocation_id::text || ':current-no-show:%'
      and exists (
        select 1
        from public.reservations reservation
        where reservation.id::text = split_part(p_record_key, ':current-no-show:', 2)
          and reservation.boarding_status = 'no_show'
          and public.get_confirmed_ticket_bus_id(
            reservation.id, reservation.confirmed_ticket
          ) = p_bus_id
          and exists (
            select 1
            from public.bus_allocations allocation
            cross join lateral jsonb_array_elements(
              allocation.allocation_data -> 'passengers'
            ) passenger
            where allocation.id = p_allocation_id
              and passenger ->> 'reservationId' = reservation.id::text
              and passenger ->> 'busId' = p_bus_id
          )
      )
    )
    or (
      p_record_key like p_allocation_id::text || ':manual:%'
      and exists (
        select 1
        from public.manual_boarding_exception_records record
        where record.id::text = split_part(p_record_key, ':manual:', 2)
          and record.allocation_id = p_allocation_id
          and record.bus_id = p_bus_id
      )
    )
  ) then
    raise exception 'The boarding exception record does not belong to this bus';
  end if;

  select reason into v_previous_reason
  from public.boarding_exception_reason_edits
  where record_key = btrim(p_record_key)
  for update;

  insert into public.boarding_exception_reason_edits (
    record_key, allocation_id, bus_id, reason, updated_by
  ) values (
    btrim(p_record_key), p_allocation_id, btrim(p_bus_id), btrim(p_reason), auth.uid()
  )
  on conflict (record_key) do update
  set allocation_id = excluded.allocation_id,
      bus_id = excluded.bus_id,
      reason = excluded.reason,
      updated_at = clock_timestamp(),
      updated_by = auth.uid();

  insert into public.boarding_exception_reason_edit_logs (
    record_key, allocation_id, bus_id, previous_reason, next_reason, edited_by
  ) values (
    btrim(p_record_key), p_allocation_id, btrim(p_bus_id),
    v_previous_reason, btrim(p_reason), auth.uid()
  );
end;
$$;

revoke all on function public.get_manual_boarding_exception_records()
  from public, anon;
revoke all on function public.create_manual_boarding_exception_record(uuid, text, uuid, text)
  from public, anon;
grant execute on function public.get_manual_boarding_exception_records()
  to authenticated;
grant execute on function public.create_manual_boarding_exception_record(uuid, text, uuid, text)
  to authenticated;

notify pgrst, 'reload schema';
