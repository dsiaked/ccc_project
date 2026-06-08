-- =========================================================
-- Shared administrator permissions and operational audit log
-- =========================================================

create or replace function public.has_admin_permission(
  p_required_role text,
  p_district text default null,
  p_team text default null,
  p_campus text default null
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.admin_roles admin_role
    where admin_role.user_id = auth.uid()
      and (
        admin_role.role = 'global_admin'
        or (
          admin_role.role = p_required_role
          and (p_district is null or admin_role.district = p_district)
          and (p_team is null or admin_role.team = p_team)
          and (p_campus is null or admin_role.campus = p_campus)
        )
      )
  );
$$;

create or replace function public.is_global_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.has_admin_permission('global_admin');
$$;

create or replace function public.is_boarding_manager()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.has_admin_permission('boarding_manager');
$$;

create or replace function public.is_campus_admin_for_scope(
  p_district text,
  p_team text,
  p_campus text
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.has_admin_permission(
    'campus_admin',
    p_district,
    p_team,
    p_campus
  );
$$;

revoke all on function public.has_admin_permission(text, text, text, text)
  from public, anon;
revoke all on function public.is_global_admin() from public, anon;
revoke all on function public.is_boarding_manager() from public, anon;
revoke all on function public.is_campus_admin_for_scope(text, text, text)
  from public, anon;
grant execute on function public.has_admin_permission(text, text, text, text)
  to authenticated;
grant execute on function public.is_global_admin() to authenticated;
grant execute on function public.is_boarding_manager() to authenticated;
grant execute on function public.is_campus_admin_for_scope(text, text, text)
  to authenticated;

create table if not exists public.admin_action_audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references auth.users(id) on delete set null,
  action text not null,
  resource_type text not null,
  resource_id uuid,
  before_data jsonb,
  after_data jsonb,
  created_at timestamptz not null default clock_timestamp()
);

create index if not exists idx_admin_action_audit_logs_created
  on public.admin_action_audit_logs(created_at desc);
create index if not exists idx_admin_action_audit_logs_resource
  on public.admin_action_audit_logs(resource_type, resource_id, created_at desc);

alter table public.admin_action_audit_logs enable row level security;

drop policy if exists "Global admins can view admin action audit logs"
  on public.admin_action_audit_logs;
create policy "Global admins can view admin action audit logs"
on public.admin_action_audit_logs for select to authenticated
using (public.is_global_admin());

grant select on public.admin_action_audit_logs to authenticated;

create or replace function public.audit_admin_operation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_resource_id uuid;
begin
  if auth.uid() is null or not exists (
    select 1
    from public.admin_roles admin_role
    where admin_role.user_id = auth.uid()
  ) then
    if tg_op = 'DELETE' then
      return old;
    end if;

    return new;
  end if;

  if tg_op = 'UPDATE' and to_jsonb(new) = to_jsonb(old) then
    return new;
  end if;

  v_resource_id := case
    when tg_op = 'DELETE' then old.id
    else new.id
  end;

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
    lower(tg_op),
    tg_table_name,
    v_resource_id,
    case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end,
    case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end
  );

  if tg_op = 'DELETE' then
    return old;
  end if;

  return new;
end;
$$;

drop trigger if exists audit_admin_payment_operation on public.payments;
create trigger audit_admin_payment_operation
after insert or update or delete on public.payments
for each row execute function public.audit_admin_operation();

drop trigger if exists audit_admin_campus_transfer_operation
  on public.campus_transfers;
create trigger audit_admin_campus_transfer_operation
after insert or update or delete on public.campus_transfers
for each row execute function public.audit_admin_operation();

revoke all on function public.audit_admin_operation()
  from public, anon, authenticated;

notify pgrst, 'reload schema';
