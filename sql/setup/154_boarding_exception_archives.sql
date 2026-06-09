create table if not exists public.boarding_exception_archives (
  record_key text primary key,
  allocation_id uuid not null,
  record_data jsonb not null,
  archived_at timestamptz not null default now(),
  archived_by uuid not null references auth.users(id) on delete restrict
);

create index if not exists idx_boarding_exception_archives_allocation
  on public.boarding_exception_archives(allocation_id, archived_at desc);

alter table public.boarding_exception_archives enable row level security;
revoke all on public.boarding_exception_archives from public, anon, authenticated;

create or replace function public.get_boarding_exception_archive_snapshot()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_is_global_admin boolean := false;
begin
  if auth.uid() is null or not exists (
    select 1
    from public.admin_roles admin_role
    where admin_role.user_id = auth.uid()
      and admin_role.role in ('global_admin', 'boarding_manager')
  ) then
    raise exception 'Only boarding administrators can view boarding exception archives';
  end if;

  v_is_global_admin := public.is_global_admin();

  return jsonb_build_object(
    'archivedKeys',
    (
      select coalesce(jsonb_agg(archive.record_key), '[]'::jsonb)
      from public.boarding_exception_archives archive
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

create or replace function public.archive_boarding_exception_as_global_admin(
  p_record_key text,
  p_allocation_id uuid,
  p_record_data jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or not public.is_global_admin() then
    raise exception 'Only global administrators can archive boarding exceptions';
  end if;

  if nullif(btrim(p_record_key), '') is null or p_record_data is null then
    raise exception 'A boarding exception record is required';
  end if;

  insert into public.boarding_exception_archives (
    record_key,
    allocation_id,
    record_data,
    archived_by
  ) values (
    btrim(p_record_key),
    p_allocation_id,
    p_record_data,
    auth.uid()
  )
  on conflict (record_key) do update
  set record_data = excluded.record_data,
      archived_at = now(),
      archived_by = auth.uid();
end;
$$;

create or replace function public.restore_boarding_exception_as_global_admin(
  p_record_key text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or not public.is_global_admin() then
    raise exception 'Only global administrators can restore boarding exceptions';
  end if;

  delete from public.boarding_exception_archives
  where record_key = btrim(p_record_key);
end;
$$;

revoke all on function public.get_boarding_exception_archive_snapshot()
  from public, anon;
revoke all on function public.archive_boarding_exception_as_global_admin(text, uuid, jsonb)
  from public, anon;
revoke all on function public.restore_boarding_exception_as_global_admin(text)
  from public, anon;
grant execute on function public.get_boarding_exception_archive_snapshot()
  to authenticated;
grant execute on function public.archive_boarding_exception_as_global_admin(text, uuid, jsonb)
  to authenticated;
grant execute on function public.restore_boarding_exception_as_global_admin(text)
  to authenticated;

notify pgrst, 'reload schema';
