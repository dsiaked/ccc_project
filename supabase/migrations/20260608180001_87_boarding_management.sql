-- =========================================================
-- Boarding manager role and live boarding management
-- =========================================================

alter table public.admin_roles
  drop constraint if exists admin_roles_role_check;

alter table public.admin_roles
  add constraint admin_roles_role_check
  check (role in ('campus_admin', 'global_admin', 'boarding_manager'));

create unique index if not exists idx_admin_roles_boarding_manager_unique
  on public.admin_roles(user_id, role)
  where role = 'boarding_manager';

create or replace function public.is_boarding_manager()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.admin_roles
    where user_id = auth.uid()
      and role in ('global_admin', 'boarding_manager')
  );
$$;

revoke all on function public.is_boarding_manager() from public, anon;
grant execute on function public.is_boarding_manager() to authenticated;

create or replace function public.assign_boarding_manager_as_global_admin(
  p_user_id uuid
)
returns public.admin_roles
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role public.admin_roles;
begin
  if not public.is_global_admin() then
    raise exception 'Only global admins can assign boarding managers.';
  end if;
  if p_user_id is null or not exists (select 1 from auth.users where id = p_user_id) then
    raise exception 'User not found.';
  end if;

  insert into public.admin_roles (user_id, role, granted_by, updated_at)
  values (p_user_id, 'boarding_manager', auth.uid(), clock_timestamp())
  on conflict (user_id, role) where role = 'boarding_manager'
  do update set granted_by = excluded.granted_by, updated_at = excluded.updated_at
  returning * into v_role;

  return v_role;
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

  delete from public.admin_roles
  where user_id = p_user_id and role = 'boarding_manager'
  returning id into v_deleted_id;

  return v_deleted_id is not null;
end;
$$;

create or replace function public.get_boarding_manager_users(
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
  is_boarding_manager boolean
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
    )
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

alter table public.reservations
  add column if not exists boarding_status text not null default 'unchecked';
alter table public.reservations
  add column if not exists boarding_status_updated_at timestamptz;
alter table public.reservations
  add column if not exists boarding_status_updated_by uuid references auth.users(id) on delete set null;
alter table public.reservations
  add column if not exists boarding_no_show_departure_id uuid;

alter table public.reservations
  drop constraint if exists reservations_boarding_status_check;
alter table public.reservations
  add constraint reservations_boarding_status_check
  check (boarding_status in ('unchecked', 'boarded', 'no_show'));

update public.reservations
set boarding_status = 'boarded',
    boarding_status_updated_at = coalesce(boarding_status_updated_at, boarding_confirmed_at)
where boarding_confirmed_at is not null
  and boarding_status = 'unchecked';

create table if not exists public.boarding_status_events (
  id uuid primary key default gen_random_uuid(),
  reservation_id uuid not null references public.reservations(id) on delete cascade,
  from_status text not null,
  to_status text not null,
  actor_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  note text
);

create table if not exists public.boarding_bus_departures (
  id uuid primary key default gen_random_uuid(),
  allocation_id uuid not null references public.bus_allocations(id) on delete cascade,
  bus_id text not null,
  bus_label text not null,
  departed_at timestamptz not null default now(),
  departed_by uuid references auth.users(id) on delete set null,
  cancelled_at timestamptz,
  cancelled_by uuid references auth.users(id) on delete set null
);

create unique index if not exists idx_boarding_active_bus_departure
  on public.boarding_bus_departures(allocation_id, bus_id)
  where cancelled_at is null;

create or replace function public.reset_bus_departures_on_allocation_cancel()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if old.allocation_data ->> 'status' = 'confirmed'
    and new.allocation_data ->> 'status' <> 'confirmed' then
    update public.boarding_bus_departures
    set cancelled_at = clock_timestamp(), cancelled_by = auth.uid()
    where allocation_id = new.id and cancelled_at is null;
  end if;
  return new;
end;
$$;

drop trigger if exists reset_bus_departures_on_allocation_cancel
  on public.bus_allocations;
create trigger reset_bus_departures_on_allocation_cancel
after update of allocation_data on public.bus_allocations
for each row
execute function public.reset_bus_departures_on_allocation_cancel();

alter table public.reservations
  drop constraint if exists reservations_boarding_no_show_departure_id_fkey;
alter table public.reservations
  add constraint reservations_boarding_no_show_departure_id_fkey
  foreign key (boarding_no_show_departure_id)
  references public.boarding_bus_departures(id)
  on delete set null;

create or replace function public.reset_boarding_confirmation_on_ticket_change()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if old.status is distinct from new.status
    or old.confirmed_ticket is distinct from new.confirmed_ticket then
    new.boarding_confirmed_at := null;
    new.boarding_status := 'unchecked';
    new.boarding_status_updated_at := null;
    new.boarding_status_updated_by := null;
    new.boarding_no_show_departure_id := null;
  end if;
  return new;
end;
$$;

create or replace function public.confirm_my_boarding()
returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_reservation public.reservations%rowtype;
  v_now timestamptz := clock_timestamp();
begin
  if v_user_id is null then raise exception 'Authentication is required.'; end if;

  select * into v_reservation
  from public.reservations
  where user_id = v_user_id and status = 'confirmed' and confirmed_ticket is not null
  for update;

  if not found then
    raise exception 'A confirmed ticket is required before boarding confirmation.';
  end if;

  if v_reservation.boarding_status <> 'boarded' then
    update public.reservations
    set boarding_status = 'boarded',
        boarding_confirmed_at = v_now,
        boarding_status_updated_at = v_now,
        boarding_status_updated_by = v_user_id,
        boarding_no_show_departure_id = null
    where id = v_reservation.id;

    insert into public.boarding_status_events (
      reservation_id, from_status, to_status, actor_id, note
    ) values (
      v_reservation.id, v_reservation.boarding_status, 'boarded', v_user_id, '탑승 확인'
    );
  end if;

  return coalesce(v_reservation.boarding_confirmed_at, v_now);
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
  v_now timestamptz := clock_timestamp();
begin
  if not public.is_boarding_manager() then
    raise exception 'Only boarding managers can update boarding status.';
  end if;
  if p_status not in ('unchecked', 'boarded', 'no_show') then
    raise exception 'Invalid boarding status.';
  end if;

  select * into v_current from public.reservations
  where id = p_reservation_id and status = 'confirmed' and confirmed_ticket is not null
  for update;
  if not found then raise exception 'Confirmed passenger not found.'; end if;
  if v_current.boarding_status = p_status then return; end if;
  if p_status = 'no_show' and not exists (
    select 1
    from public.boarding_bus_departures departure
    join public.bus_allocations allocation on allocation.id = departure.allocation_id
    where departure.cancelled_at is null
      and allocation.allocation_data ->> 'status' = 'confirmed'
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
        'updatedAt', reservation.boarding_status_updated_at,
        'updatedByName', actor.name
      ) order by reservation.campus, reservation.name), '[]'::jsonb)
      from public.reservations reservation
      left join public.profiles actor on actor.id = reservation.boarding_status_updated_by
      where reservation.status = 'confirmed' and reservation.confirmed_ticket is not null
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
        and event.created_at >= coalesce(
          nullif(reservation.confirmed_ticket ->> 'confirmedAt', '')::timestamptz,
          '-infinity'::timestamptz
        )
    )
  );
end;
$$;

-- Keep at most one confirmed allocation and require explicit cancellation before replacement.
update public.bus_allocations allocation
set allocation_data = jsonb_set(allocation.allocation_data, '{status}', '"archived"'::jsonb, true)
where allocation.allocation_data ->> 'status' = 'confirmed'
  and allocation.id <> (
    select id from public.bus_allocations
    where allocation_data ->> 'status' = 'confirmed'
    order by updated_at desc nulls last, created_at desc
    limit 1
  );

create unique index if not exists idx_bus_allocations_single_confirmed
  on public.bus_allocations ((1))
  where allocation_data ->> 'status' = 'confirmed';

create or replace function public.enforce_single_confirmed_allocation()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.allocation_data ->> 'status' = 'confirmed'
    and exists (
      select 1 from public.bus_allocations
      where id <> new.id and allocation_data ->> 'status' = 'confirmed'
    ) then
    raise exception 'Cancel the existing confirmed allocation before confirming another.';
  end if;
  return new;
end;
$$;

drop trigger if exists enforce_single_confirmed_allocation on public.bus_allocations;
create trigger enforce_single_confirmed_allocation
before insert or update of allocation_data on public.bus_allocations
for each row execute function public.enforce_single_confirmed_allocation();

alter table public.boarding_status_events enable row level security;
alter table public.boarding_bus_departures enable row level security;

drop policy if exists "Boarding managers can view reservations" on public.reservations;
create policy "Boarding managers can view reservations"
on public.reservations for select to authenticated
using (public.is_boarding_manager());

drop policy if exists "Boarding managers can view boarding events" on public.boarding_status_events;
create policy "Boarding managers can view boarding events"
on public.boarding_status_events for select to authenticated
using (public.is_boarding_manager());

drop policy if exists "Boarding managers can view bus departures" on public.boarding_bus_departures;
create policy "Boarding managers can view bus departures"
on public.boarding_bus_departures for select to authenticated
using (public.is_boarding_manager());

revoke insert, update, delete on public.boarding_status_events from public, anon, authenticated;
revoke insert, update, delete on public.boarding_bus_departures from public, anon, authenticated;

revoke all on function public.assign_boarding_manager_as_global_admin(uuid) from public, anon;
revoke all on function public.cancel_boarding_manager_as_global_admin(uuid) from public, anon;
revoke all on function public.get_boarding_manager_users(text) from public, anon;
revoke all on function public.set_passenger_boarding_status(uuid, text) from public, anon;
revoke all on function public.mark_boarding_bus_departed(text) from public, anon;
revoke all on function public.cancel_boarding_bus_departure(text) from public, anon;
revoke all on function public.get_boarding_management_snapshot() from public, anon;

grant execute on function public.assign_boarding_manager_as_global_admin(uuid) to authenticated;
grant execute on function public.cancel_boarding_manager_as_global_admin(uuid) to authenticated;
grant execute on function public.get_boarding_manager_users(text) to authenticated;
grant execute on function public.set_passenger_boarding_status(uuid, text) to authenticated;
grant execute on function public.mark_boarding_bus_departed(text) to authenticated;
grant execute on function public.cancel_boarding_bus_departure(text) to authenticated;
grant execute on function public.get_boarding_management_snapshot() to authenticated;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'reservations'
  ) then
    alter publication supabase_realtime add table public.reservations;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'boarding_bus_departures'
  ) then
    alter publication supabase_realtime add table public.boarding_bus_departures;
  end if;
end;
$$;

notify pgrst, 'reload schema';
