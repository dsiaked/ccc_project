-- Limit boarding exception records to assigned buses and allow scoped reason edits.

create table if not exists public.boarding_exception_reason_edits (
  record_key text primary key,
  allocation_id uuid not null references public.bus_allocations(id) on delete cascade,
  bus_id text not null,
  reason text not null,
  updated_at timestamptz not null default clock_timestamp(),
  updated_by uuid not null references auth.users(id) on delete restrict
);

create table if not exists public.boarding_exception_reason_edit_logs (
  id uuid primary key default gen_random_uuid(),
  record_key text not null,
  allocation_id uuid not null references public.bus_allocations(id) on delete cascade,
  bus_id text not null,
  previous_reason text,
  next_reason text not null,
  edited_at timestamptz not null default clock_timestamp(),
  edited_by uuid not null references auth.users(id) on delete restrict
);

create index if not exists idx_boarding_exception_reason_edits_scope
  on public.boarding_exception_reason_edits(allocation_id, bus_id);
create index if not exists idx_boarding_exception_reason_edit_logs_record
  on public.boarding_exception_reason_edit_logs(record_key, edited_at desc);

alter table public.boarding_exception_reason_edits enable row level security;
alter table public.boarding_exception_reason_edit_logs enable row level security;
revoke all on public.boarding_exception_reason_edits from public, anon, authenticated;
revoke all on public.boarding_exception_reason_edit_logs from public, anon, authenticated;

create or replace function public.get_boarding_exception_reason_edit_snapshot()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_boarding_manager() then
    raise exception 'Only boarding administrators can view boarding exception reason edits';
  end if;

  return coalesce(
    (
      select jsonb_agg(
        jsonb_build_object(
          'recordKey', edit.record_key,
          'reason', edit.reason,
          'updatedAt', edit.updated_at,
          'updatedByName', coalesce(actor.name, '탑승 관리자')
        )
        order by edit.updated_at desc
      )
      from public.boarding_exception_reason_edits edit
      left join public.profiles actor on actor.id = edit.updated_by
      where public.can_manage_boarding_bus(edit.allocation_id, edit.bus_id)
    ),
    '[]'::jsonb
  );
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
  if not exists (
    select 1
    from public.bus_allocations allocation
    cross join lateral jsonb_array_elements(allocation.allocation_data -> 'buses') bus
    where allocation.id = p_allocation_id
      and bus ->> 'id' = p_bus_id
  ) then
    raise exception 'The boarding exception bus does not exist in this allocation';
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

create or replace function public.get_boarding_exception_archive_snapshot()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_is_global_admin boolean := false;
begin
  if not public.is_boarding_manager() then
    raise exception 'Only boarding administrators can view boarding exception archives';
  end if;

  v_is_global_admin := public.is_global_admin();

  return jsonb_build_object(
    'archivedKeys',
    (
      select coalesce(jsonb_agg(archive.record_key), '[]'::jsonb)
      from public.boarding_exception_archives archive
      where v_is_global_admin
        or public.can_manage_boarding_bus(
          archive.allocation_id,
          archive.record_data ->> 'busId'
        )
    ),
    'records',
    case
      when v_is_global_admin then (
        select coalesce(
          jsonb_agg(
            archive.record_data || jsonb_build_object(
              'archivedAt', archive.archived_at,
              'archivedByName', coalesce(actor.name, '전체 관리자')
            )
            order by archive.archived_at desc
          ),
          '[]'::jsonb
        )
        from public.boarding_exception_archives archive
        left join public.profiles actor on actor.id = archive.archived_by
      )
      else '[]'::jsonb
    end
  );
end;
$$;

revoke all on function public.get_boarding_exception_reason_edit_snapshot()
  from public, anon;
revoke all on function public.update_boarding_exception_reason(text, uuid, text, text)
  from public, anon;
grant execute on function public.get_boarding_exception_reason_edit_snapshot()
  to authenticated;
grant execute on function public.update_boarding_exception_reason(text, uuid, text, text)
  to authenticated;

notify pgrst, 'reload schema';
