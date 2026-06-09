-- =========================================================
-- Privacy-safe activity logging and AI operations reports
-- =========================================================

create table if not exists public.activity_event_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references auth.users(id) on delete set null,
  actor_kind text not null check (actor_kind in ('user', 'admin', 'system')),
  event_name text not null,
  category text not null,
  route text,
  metadata jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default clock_timestamp(),
  created_at timestamptz not null default clock_timestamp()
);

create index if not exists idx_activity_event_logs_occurred_id
  on public.activity_event_logs(occurred_at desc, id desc);
create index if not exists idx_activity_event_logs_actor_occurred
  on public.activity_event_logs(actor_id, occurred_at desc);
create index if not exists idx_activity_event_logs_category_occurred
  on public.activity_event_logs(category, occurred_at desc);

alter table public.activity_event_logs enable row level security;

drop policy if exists "Global admins can view activity event logs"
  on public.activity_event_logs;
create policy "Global admins can view activity event logs"
on public.activity_event_logs for select to authenticated
using (public.is_global_admin());

grant select on public.activity_event_logs to authenticated;

create or replace function public.record_activity_event(
  p_event_name text,
  p_category text default 'interaction',
  p_route text default null,
  p_metadata jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_metadata jsonb;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required.';
  end if;

  if length(trim(coalesce(p_event_name, ''))) = 0
     or length(p_event_name) > 100 then
    raise exception 'Invalid event name.';
  end if;

  if length(trim(coalesce(p_category, ''))) = 0
     or length(p_category) > 50 then
    raise exception 'Invalid event category.';
  end if;

  select coalesce(jsonb_object_agg(item.key, item.value), '{}'::jsonb)
  into v_metadata
  from jsonb_each(coalesce(p_metadata, '{}'::jsonb)) item
  where item.key in (
    'source',
    'outcome',
    'duration_ms',
    'resource_type',
    'resource_id',
    'error_code',
    'page_title'
  );

  insert into public.activity_event_logs (
    actor_id,
    actor_kind,
    event_name,
    category,
    route,
    metadata
  )
  values (
    auth.uid(),
    case
      when exists (
        select 1
        from public.admin_roles admin_role
        where admin_role.user_id = auth.uid()
      ) then 'admin'
      else 'user'
    end,
    trim(p_event_name),
    trim(p_category),
    left(nullif(trim(coalesce(p_route, '')), ''), 300),
    v_metadata
  )
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.record_activity_event(text, text, text, jsonb)
  from public, anon;
grant execute on function public.record_activity_event(text, text, text, jsonb)
  to authenticated;

create or replace function public.audit_business_activity_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row jsonb;
begin
  v_row := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;

  insert into public.activity_event_logs (
    actor_id,
    actor_kind,
    event_name,
    category,
    metadata
  )
  values (
    auth.uid(),
    case
      when auth.uid() is null then 'system'
      when exists (
        select 1 from public.admin_roles admin_role
        where admin_role.user_id = auth.uid()
      ) then 'admin'
      else 'user'
    end,
    tg_table_name || '.' || lower(tg_op),
    'data_change',
    jsonb_strip_nulls(jsonb_build_object(
      'resource_type', tg_table_name,
      'resource_id', v_row ->> 'id',
      'outcome', coalesce(v_row ->> 'status', lower(tg_op))
    ))
  );

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

revoke all on function public.audit_business_activity_event()
  from public, anon, authenticated;

do $$
declare
  v_table text;
begin
  foreach v_table in array array[
    'reservations',
    'payments',
    'campus_transfers',
    'bus_allocations',
    'campus_requests',
    'boarding_move_requests',
    'boarding_exception_archives'
  ]
  loop
    if to_regclass('public.' || v_table) is not null then
      execute format(
        'drop trigger if exists audit_business_activity_event on public.%I',
        v_table
      );
      execute format(
        'create trigger audit_business_activity_event
         after insert or update or delete on public.%I
         for each row execute function public.audit_business_activity_event()',
        v_table
      );
    end if;
  end loop;
end;
$$;

create table if not exists public.ai_operations_reports (
  id uuid primary key default gen_random_uuid(),
  requested_by uuid references auth.users(id) on delete set null,
  status text not null default 'pending'
    check (status in ('pending', 'completed', 'failed')),
  period_start timestamptz not null,
  period_end timestamptz not null,
  anonymized boolean not null default true,
  input_summary jsonb not null default '{}'::jsonb,
  report_markdown text,
  model text,
  error_message text,
  created_at timestamptz not null default clock_timestamp(),
  completed_at timestamptz
);

create index if not exists idx_ai_operations_reports_created
  on public.ai_operations_reports(created_at desc);

alter table public.ai_operations_reports enable row level security;

drop policy if exists "Global admins can view AI operations reports"
  on public.ai_operations_reports;
create policy "Global admins can view AI operations reports"
on public.ai_operations_reports for select to authenticated
using (public.is_global_admin());

grant select on public.ai_operations_reports to authenticated;

notify pgrst, 'reload schema';
