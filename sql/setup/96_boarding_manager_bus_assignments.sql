-- =========================================================
-- Boarding manager bus assignments
-- =========================================================

create table if not exists public.boarding_manager_bus_assignments (
  id uuid primary key default gen_random_uuid(),
  allocation_id uuid not null references public.bus_allocations(id) on delete cascade,
  manager_user_id uuid not null references auth.users(id) on delete cascade,
  bus_id text not null,
  assigned_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (allocation_id, manager_user_id, bus_id)
);

create index if not exists idx_boarding_manager_bus_assignments_manager
  on public.boarding_manager_bus_assignments(manager_user_id, allocation_id);

alter table public.boarding_manager_bus_assignments enable row level security;

revoke insert, update, delete on public.boarding_manager_bus_assignments
  from public, anon, authenticated;

create or replace function public.can_manage_boarding_bus(
  p_allocation_id uuid,
  p_bus_id text
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_global_admin()
    or exists (
      select 1
      from public.boarding_manager_bus_assignments assignment
      where assignment.allocation_id = p_allocation_id
        and assignment.manager_user_id = auth.uid()
        and assignment.bus_id = p_bus_id
    );
$$;

create or replace function public.can_manage_boarding_bus_label(
  p_allocation_id uuid,
  p_bus_label text
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_global_admin()
    or exists (
      select 1
      from public.boarding_manager_bus_assignments assignment
      join public.bus_allocations allocation on allocation.id = assignment.allocation_id
      cross join lateral jsonb_array_elements(allocation.allocation_data -> 'buses') bus
      where assignment.allocation_id = p_allocation_id
        and assignment.manager_user_id = auth.uid()
        and assignment.bus_id = bus ->> 'id'
        and bus ->> 'label' = p_bus_label
    );
$$;

create or replace function public.can_manage_current_boarding_bus_label(
  p_bus_label text
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.bus_allocations allocation
    where allocation.allocation_data ->> 'status' = 'confirmed'
      and public.can_manage_boarding_bus_label(allocation.id, p_bus_label)
  );
$$;

create or replace function public.can_manage_boarding_reservation(
  p_reservation_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.reservations reservation
    where reservation.id = p_reservation_id
      and public.can_manage_current_boarding_bus_label(
        reservation.confirmed_ticket ->> 'busNumber'
      )
  );
$$;

drop policy if exists "Boarding managers can view their bus assignments"
  on public.boarding_manager_bus_assignments;
create policy "Boarding managers can view their bus assignments"
on public.boarding_manager_bus_assignments for select to authenticated
using (
  public.is_global_admin()
  or manager_user_id = auth.uid()
);

drop policy if exists "Boarding managers can view reservations" on public.reservations;
create policy "Boarding managers can view reservations"
on public.reservations for select to authenticated
using (
  public.can_manage_current_boarding_bus_label(
    reservations.confirmed_ticket ->> 'busNumber'
  )
);

drop policy if exists "Boarding managers can view boarding events" on public.boarding_status_events;
create policy "Boarding managers can view boarding events"
on public.boarding_status_events for select to authenticated
using (
  public.can_manage_boarding_reservation(boarding_status_events.reservation_id)
);

drop policy if exists "Boarding managers can view bus departures" on public.boarding_bus_departures;
create policy "Boarding managers can view bus departures"
on public.boarding_bus_departures for select to authenticated
using (
  public.can_manage_boarding_bus(allocation_id, bus_id)
);

create or replace function public.get_boarding_manager_assignment_options()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_allocation public.bus_allocations%rowtype;
begin
  if not public.is_global_admin() then
    raise exception 'Only global admins can manage boarding manager assignments.';
  end if;

  select * into v_allocation
  from public.bus_allocations
  where allocation_data ->> 'status' = 'confirmed';

  if not found then
    return jsonb_build_object(
      'allocationId', null,
      'allocationName', null,
      'buses', '[]'::jsonb
    );
  end if;

  return jsonb_build_object(
    'allocationId', v_allocation.id,
    'allocationName', v_allocation.allocation_name,
    'buses', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', bus ->> 'id',
        'label', bus ->> 'label',
        'destination', bus ->> 'destination'
      ) order by bus ->> 'label'), '[]'::jsonb)
      from jsonb_array_elements(v_allocation.allocation_data -> 'buses') bus
    )
  );
end;
$$;

create or replace function public.set_boarding_manager_bus_assignments_as_global_admin(
  p_user_id uuid,
  p_bus_ids text[]
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_allocation public.bus_allocations%rowtype;
  v_requested_count integer;
  v_valid_count integer;
begin
  if not public.is_global_admin() then
    raise exception 'Only global admins can manage boarding manager assignments.';
  end if;
  if not exists (
    select 1 from public.admin_roles
    where user_id = p_user_id and role = 'boarding_manager'
  ) then
    raise exception 'The selected user is not a boarding manager.';
  end if;

  select * into v_allocation
  from public.bus_allocations
  where allocation_data ->> 'status' = 'confirmed';
  if not found then
    raise exception 'Confirmed allocation not found.';
  end if;

  select count(distinct bus_id)
  into v_requested_count
  from unnest(coalesce(p_bus_ids, array[]::text[])) bus_id;

  select count(distinct bus ->> 'id')
  into v_valid_count
  from jsonb_array_elements(v_allocation.allocation_data -> 'buses') bus
  where bus ->> 'id' = any(coalesce(p_bus_ids, array[]::text[]));

  if v_requested_count <> v_valid_count then
    raise exception 'One or more selected buses do not belong to the confirmed allocation.';
  end if;

  delete from public.boarding_manager_bus_assignments
  where allocation_id = v_allocation.id
    and manager_user_id = p_user_id;

  insert into public.boarding_manager_bus_assignments (
    allocation_id, manager_user_id, bus_id, assigned_by
  )
  select v_allocation.id, p_user_id, bus_id, auth.uid()
  from (
    select distinct bus_id
    from unnest(coalesce(p_bus_ids, array[]::text[])) bus_id
  ) requested;
end;
$$;

drop function if exists public.get_boarding_manager_users(text);
create function public.get_boarding_manager_users(
  p_search text default ''
)
returns table (
  user_id uuid,
  name text,
  email text,
  phone text,
  district text,
  team text,
  campus text,
  is_boarding_manager boolean,
  assigned_bus_ids text[]
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_global_admin() then
    raise exception 'Only global admins can manage boarding managers.';
  end if;

  return query
  select
    profile.id,
    coalesce(profile.name, '이름 없음'),
    profile.email,
    profile.phone,
    profile.district,
    profile.team,
    profile.campus,
    exists (
      select 1 from public.admin_roles role
      where role.user_id = profile.id and role.role = 'boarding_manager'
    ),
    coalesce((
      select array_agg(assignment.bus_id order by assignment.bus_id)
      from public.boarding_manager_bus_assignments assignment
      join public.bus_allocations allocation on allocation.id = assignment.allocation_id
      where assignment.manager_user_id = profile.id
        and allocation.allocation_data ->> 'status' = 'confirmed'
    ), array[]::text[])
  from public.profiles profile
  where nullif(trim(p_search), '') is null
    or concat_ws(' ', profile.name, profile.email, profile.phone, profile.campus)
      ilike '%' || trim(p_search) || '%'
  order by
    exists (
      select 1 from public.admin_roles role
      where role.user_id = profile.id and role.role = 'boarding_manager'
    ) desc,
    profile.name asc nulls last
  limit 200;
end;
$$;

create or replace function public.cancel_boarding_manager_as_global_admin(
  p_user_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_deleted_id uuid;
begin
  if not public.is_global_admin() then
    raise exception 'Only global admins can cancel boarding managers.';
  end if;

  delete from public.boarding_manager_bus_assignments
  where manager_user_id = p_user_id;

  delete from public.admin_roles
  where user_id = p_user_id and role = 'boarding_manager'
  returning id into v_deleted_id;

  return v_deleted_id is not null;
end;
$$;

create or replace function public.set_passenger_boarding_status(
  p_reservation_id uuid,
  p_status text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_current public.reservations%rowtype;
  v_allocation_id uuid;
  v_now timestamptz := clock_timestamp();
begin
  if not public.is_boarding_manager() then
    raise exception 'Only boarding managers can update boarding status.';
  end if;
  if p_status not in ('unchecked', 'boarded', 'no_show') then
    raise exception 'Invalid boarding status.';
  end if;

  select id into v_allocation_id
  from public.bus_allocations
  where allocation_data ->> 'status' = 'confirmed';
  if not found then raise exception 'Confirmed allocation not found.'; end if;

  select * into v_current from public.reservations
  where id = p_reservation_id and status = 'confirmed' and confirmed_ticket is not null
  for update;
  if not found then raise exception 'Confirmed passenger not found.'; end if;
  if not public.can_manage_boarding_bus_label(
    v_allocation_id,
    v_current.confirmed_ticket ->> 'busNumber'
  ) then
    raise exception 'You are not assigned to this bus.';
  end if;
  if v_current.boarding_status = p_status then return; end if;
  if p_status = 'no_show' and not exists (
    select 1
    from public.boarding_bus_departures departure
    where departure.allocation_id = v_allocation_id
      and departure.cancelled_at is null
      and departure.bus_label = v_current.confirmed_ticket ->> 'busNumber'
  ) then
    raise exception 'No-show status is available after bus departure.';
  end if;

  update public.reservations
  set boarding_status = p_status,
      boarding_confirmed_at = case when p_status = 'boarded' then v_now else null end,
      boarding_status_updated_at = v_now,
      boarding_status_updated_by = auth.uid(),
      boarding_no_show_departure_id = null
  where id = p_reservation_id;

  insert into public.boarding_status_events (
    reservation_id, from_status, to_status, actor_id, note
  ) values (
    p_reservation_id, v_current.boarding_status, p_status, auth.uid(), '선탑자 상태 변경'
  );
end;
$$;

create or replace function public.update_passenger_boarding_note(
  p_reservation_id uuid,
  p_note text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
  v_allocation_id uuid;
  v_bus_label text;
begin
  if not public.is_boarding_manager() then
    raise exception 'Only boarding managers can update boarding notes.';
  end if;
  if char_length(coalesce(v_note, '')) > 500 then
    raise exception 'Boarding notes must be 500 characters or fewer.';
  end if;

  select id into v_allocation_id
  from public.bus_allocations
  where allocation_data ->> 'status' = 'confirmed';

  select confirmed_ticket ->> 'busNumber' into v_bus_label
  from public.reservations
  where id = p_reservation_id and status = 'confirmed' and confirmed_ticket is not null;

  if v_bus_label is null then raise exception 'Confirmed passenger not found.'; end if;
  if not public.can_manage_boarding_bus_label(v_allocation_id, v_bus_label) then
    raise exception 'You are not assigned to this bus.';
  end if;

  update public.reservations
  set boarding_note = v_note,
      boarding_note_updated_at = clock_timestamp(),
      boarding_note_updated_by = auth.uid()
  where id = p_reservation_id;
end;
$$;

create or replace function public.mark_boarding_bus_departed(p_bus_id text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_allocation public.bus_allocations%rowtype;
  v_bus jsonb;
  v_departure_id uuid;
  v_now timestamptz := clock_timestamp();
begin
  if not public.is_boarding_manager() then raise exception 'Only boarding managers can mark departure.'; end if;

  select * into v_allocation from public.bus_allocations
  where allocation_data ->> 'status' = 'confirmed'
  for update;
  if not found then raise exception 'Confirmed allocation not found.'; end if;
  if not public.can_manage_boarding_bus(v_allocation.id, p_bus_id) then
    raise exception 'You are not assigned to this bus.';
  end if;

  select bus into v_bus
  from jsonb_array_elements(v_allocation.allocation_data -> 'buses') bus
  where bus ->> 'id' = p_bus_id;
  if v_bus is null then raise exception 'Bus not found.'; end if;

  insert into public.boarding_bus_departures (
    allocation_id, bus_id, bus_label, departed_at, departed_by
  ) values (
    v_allocation.id, p_bus_id, v_bus ->> 'label', v_now, auth.uid()
  ) returning id into v_departure_id;

  with changed as (
    update public.reservations
    set boarding_status = 'no_show',
        boarding_confirmed_at = null,
        boarding_status_updated_at = v_now,
        boarding_status_updated_by = auth.uid(),
        boarding_no_show_departure_id = v_departure_id
    where status = 'confirmed'
      and boarding_status = 'unchecked'
      and confirmed_ticket ->> 'busNumber' = v_bus ->> 'label'
    returning id
  )
  insert into public.boarding_status_events (
    reservation_id, from_status, to_status, actor_id, note
  )
  select id, 'unchecked', 'no_show', auth.uid(), '호차 출발 완료 일괄 처리'
  from changed;

  return v_departure_id;
end;
$$;

create or replace function public.cancel_boarding_bus_departure(p_bus_id text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_departure public.boarding_bus_departures%rowtype;
  v_now timestamptz := clock_timestamp();
begin
  if not public.is_boarding_manager() then raise exception 'Only boarding managers can cancel departure.'; end if;

  select * into v_departure
  from public.boarding_bus_departures
  where bus_id = p_bus_id and cancelled_at is null
  order by departed_at desc
  limit 1
  for update;
  if not found then raise exception 'Active bus departure not found.'; end if;
  if not public.can_manage_boarding_bus(v_departure.allocation_id, p_bus_id) then
    raise exception 'You are not assigned to this bus.';
  end if;

  with changed as (
    update public.reservations
    set boarding_status = 'unchecked',
        boarding_status_updated_at = v_now,
        boarding_status_updated_by = auth.uid(),
        boarding_no_show_departure_id = null
    where boarding_no_show_departure_id = v_departure.id
      and boarding_status = 'no_show'
    returning id
  )
  insert into public.boarding_status_events (
    reservation_id, from_status, to_status, actor_id, note
  )
  select id, 'no_show', 'unchecked', auth.uid(), '호차 출발 완료 취소 자동 복구'
  from changed;

  update public.boarding_bus_departures
  set cancelled_at = v_now, cancelled_by = auth.uid()
  where id = v_departure.id;
end;
$$;

create or replace function public.get_boarding_management_snapshot()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_allocation public.bus_allocations%rowtype;
begin
  if not public.is_boarding_manager() then
    raise exception 'Only boarding managers can view boarding management.';
  end if;

  select * into v_allocation
  from public.bus_allocations
  where allocation_data ->> 'status' = 'confirmed';

  if not found then return null; end if;

  return jsonb_build_object(
    'allocationId', v_allocation.id,
    'allocationName', v_allocation.allocation_name,
    'buses', (
      select coalesce(jsonb_agg(
        bus || jsonb_build_object(
          'departedAt', departure.departed_at,
          'departedBy', departure.departed_by
        ) order by bus ->> 'label'
      ), '[]'::jsonb)
      from jsonb_array_elements(v_allocation.allocation_data -> 'buses') bus
      left join public.boarding_bus_departures departure
        on departure.allocation_id = v_allocation.id
       and departure.bus_id = bus ->> 'id'
       and departure.cancelled_at is null
      where public.can_manage_boarding_bus(v_allocation.id, bus ->> 'id')
    ),
    'passengers', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'reservationId', reservation.id,
        'name', reservation.name,
        'phone', reservation.phone,
        'district', reservation.district,
        'team', reservation.team,
        'campus', reservation.campus,
        'busNumber', reservation.confirmed_ticket ->> 'busNumber',
        'seatNumber', reservation.confirmed_ticket ->> 'seatNumber',
        'boardingStatus', reservation.boarding_status,
        'boardingNote', reservation.boarding_note,
        'boardingNoteUpdatedAt', reservation.boarding_note_updated_at,
        'boardingNoteUpdatedByName', note_actor.name,
        'updatedAt', reservation.boarding_status_updated_at,
        'updatedByName', status_actor.name
      ) order by reservation.campus, reservation.name), '[]'::jsonb)
      from public.reservations reservation
      left join public.profiles status_actor on status_actor.id = reservation.boarding_status_updated_by
      left join public.profiles note_actor on note_actor.id = reservation.boarding_note_updated_by
      where reservation.status = 'confirmed'
        and reservation.confirmed_ticket is not null
        and public.can_manage_boarding_bus_label(
          v_allocation.id,
          reservation.confirmed_ticket ->> 'busNumber'
        )
    ),
    'events', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', event.id,
        'reservationId', event.reservation_id,
        'fromStatus', event.from_status,
        'toStatus', event.to_status,
        'actorType', case
          when event.note = '탑승 확인' then 'passenger'
          when event.note like '호차 출발%' then 'automatic'
          else 'boarding_manager'
        end,
        'actorName', actor.name,
        'createdAt', event.created_at,
        'note', event.note
      ) order by event.created_at desc), '[]'::jsonb)
      from public.boarding_status_events event
      left join public.profiles actor on actor.id = event.actor_id
      join public.reservations reservation on reservation.id = event.reservation_id
      where reservation.status = 'confirmed'
        and public.can_manage_boarding_bus_label(
          v_allocation.id,
          reservation.confirmed_ticket ->> 'busNumber'
        )
        and event.created_at >= coalesce(
          nullif(reservation.confirmed_ticket ->> 'confirmedAt', '')::timestamptz,
          '-infinity'::timestamptz
        )
    )
  );
end;
$$;

revoke all on function public.can_manage_boarding_bus(uuid, text) from public, anon;
revoke all on function public.can_manage_boarding_bus_label(uuid, text) from public, anon;
revoke all on function public.can_manage_current_boarding_bus_label(text) from public, anon;
revoke all on function public.can_manage_boarding_reservation(uuid) from public, anon;
revoke all on function public.get_boarding_manager_assignment_options() from public, anon;
revoke all on function public.set_boarding_manager_bus_assignments_as_global_admin(uuid, text[]) from public, anon;
revoke all on function public.get_boarding_manager_users(text) from public, anon;

grant execute on function public.can_manage_boarding_bus(uuid, text) to authenticated;
grant execute on function public.can_manage_boarding_bus_label(uuid, text) to authenticated;
grant execute on function public.can_manage_current_boarding_bus_label(text) to authenticated;
grant execute on function public.can_manage_boarding_reservation(uuid) to authenticated;
grant execute on function public.get_boarding_manager_assignment_options() to authenticated;
grant execute on function public.set_boarding_manager_bus_assignments_as_global_admin(uuid, text[]) to authenticated;
grant execute on function public.get_boarding_manager_users(text) to authenticated;

notify pgrst, 'reload schema';
