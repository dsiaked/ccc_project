-- =========================================================
-- Campus request read state, audit history, and realtime support
-- =========================================================

create table if not exists public.campus_request_reads (
  user_id uuid not null references auth.users(id) on delete cascade,
  request_id uuid not null references public.campus_requests(id) on delete cascade,
  read_at timestamptz not null default clock_timestamp(),
  primary key (user_id, request_id)
);

create index if not exists idx_campus_request_reads_request
  on public.campus_request_reads(request_id);

alter table public.campus_request_reads enable row level security;

drop policy if exists "Admins can view own campus request reads" on public.campus_request_reads;
drop policy if exists "Admins can create own campus request reads" on public.campus_request_reads;
drop policy if exists "Admins can update own campus request reads" on public.campus_request_reads;

create policy "Admins can view own campus request reads"
on public.campus_request_reads for select to authenticated
using (user_id = auth.uid());

create policy "Admins can create own campus request reads"
on public.campus_request_reads for insert to authenticated
with check (user_id = auth.uid());

create policy "Admins can update own campus request reads"
on public.campus_request_reads for update to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

create table if not exists public.campus_request_audit_logs (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.campus_requests(id) on delete cascade,
  message_id uuid,
  actor_id uuid,
  action text not null check (
    action in ('status_changed', 'response_changed', 'message_updated', 'message_deleted')
  ),
  before_data jsonb,
  after_data jsonb,
  created_at timestamptz not null default clock_timestamp()
);

create index if not exists idx_campus_request_audit_logs_request_created
  on public.campus_request_audit_logs(request_id, created_at desc);

alter table public.campus_request_audit_logs enable row level security;

drop policy if exists "Global admins can view campus request audit logs" on public.campus_request_audit_logs;
create policy "Global admins can view campus request audit logs"
on public.campus_request_audit_logs for select to authenticated
using (public.is_global_admin());

grant select on public.campus_request_audit_logs to authenticated;

create or replace function public.audit_campus_request_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status is distinct from old.status then
    insert into public.campus_request_audit_logs (
      request_id, actor_id, action, before_data, after_data
    )
    values (
      old.id, auth.uid(), 'status_changed',
      jsonb_build_object('status', old.status),
      jsonb_build_object('status', new.status)
    );
  end if;

  if new.admin_response is distinct from old.admin_response then
    insert into public.campus_request_audit_logs (
      request_id, actor_id, action, before_data, after_data
    )
    values (
      old.id, auth.uid(), 'response_changed',
      jsonb_build_object('admin_response', old.admin_response),
      jsonb_build_object('admin_response', new.admin_response)
    );
  end if;

  return new;
end;
$$;

drop trigger if exists audit_campus_request_change on public.campus_requests;
create trigger audit_campus_request_change
after update on public.campus_requests
for each row execute function public.audit_campus_request_change();

create or replace function public.audit_campus_request_message_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' and new.message is distinct from old.message then
    insert into public.campus_request_audit_logs (
      request_id, message_id, actor_id, action, before_data, after_data
    )
    values (
      old.request_id, old.id, auth.uid(), 'message_updated',
      jsonb_build_object('message', old.message),
      jsonb_build_object('message', new.message)
    );
    return new;
  end if;

  if tg_op = 'DELETE' then
    insert into public.campus_request_audit_logs (
      request_id, message_id, actor_id, action, before_data
    )
    values (
      old.request_id, old.id, auth.uid(), 'message_deleted',
      jsonb_build_object(
        'sender_id', old.sender_id,
        'sender_role', old.sender_role,
        'message', old.message,
        'created_at', old.created_at
      )
    );
    return old;
  end if;

  return null;
end;
$$;

drop trigger if exists audit_campus_request_message_change
  on public.campus_request_messages;
create trigger audit_campus_request_message_change
after update or delete on public.campus_request_messages
for each row execute function public.audit_campus_request_message_change();

create or replace function public.mark_campus_request_read(p_request_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'Authentication is required.'; end if;
  if not exists (
    select 1
    from public.campus_requests request
    join public.admin_roles role on role.user_id = auth.uid()
    where request.id = p_request_id
      and (
        role.role = 'global_admin'
        or (
          role.role = 'campus_admin'
          and role.district = request.district
          and role.team = request.team
          and role.campus = request.campus
        )
      )
  ) then
    raise exception 'Campus request not found or inaccessible.';
  end if;

  insert into public.campus_request_reads (user_id, request_id, read_at)
  values (auth.uid(), p_request_id, clock_timestamp())
  on conflict (user_id, request_id)
  do update set read_at = excluded.read_at;
end;
$$;

create or replace function public.get_unread_campus_request_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select distinct request.id
  from public.campus_requests request
  join public.admin_roles role on role.user_id = auth.uid()
  left join public.campus_request_reads read_state
    on read_state.user_id = auth.uid()
   and read_state.request_id = request.id
  where request.is_global_notice = false
    and (
      role.role = 'global_admin'
      or (
        role.role = 'campus_admin'
        and role.district = request.district
        and role.team = request.team
        and role.campus = request.campus
      )
    )
    and exists (
      select 1
      from public.campus_request_messages message
      where message.request_id = request.id
        and message.created_at > coalesce(read_state.read_at, '-infinity'::timestamptz)
        and (
          (role.role = 'global_admin' and message.sender_role = 'campus_admin')
          or (role.role = 'campus_admin' and message.sender_role = 'global_admin')
        )
    );
$$;

revoke all on function public.mark_campus_request_read(uuid) from public, anon;
revoke all on function public.get_unread_campus_request_ids() from public, anon;
revoke all on function public.audit_campus_request_change() from public, anon, authenticated;
revoke all on function public.audit_campus_request_message_change() from public, anon, authenticated;
grant execute on function public.mark_campus_request_read(uuid) to authenticated;
grant execute on function public.get_unread_campus_request_ids() to authenticated;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'campus_requests'
  ) then
    alter publication supabase_realtime add table public.campus_requests;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'campus_request_messages'
  ) then
    alter publication supabase_realtime add table public.campus_request_messages;
  end if;
end;
$$;

notify pgrst, 'reload schema';
