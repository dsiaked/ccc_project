-- =========================================================
-- Select which privacy-safe logs are included in AI reports
-- =========================================================

create table if not exists public.ai_report_log_settings (
  id boolean primary key default true check (id),
  include_navigation boolean not null default true,
  include_authentication boolean not null default true,
  include_data_changes boolean not null default true,
  include_admin_audit boolean not null default true,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default clock_timestamp()
);

insert into public.ai_report_log_settings (id)
values (true)
on conflict (id) do nothing;

alter table public.ai_report_log_settings enable row level security;

drop policy if exists "Global admins can view AI report log settings"
  on public.ai_report_log_settings;
create policy "Global admins can view AI report log settings"
on public.ai_report_log_settings for select to authenticated
using (public.is_global_admin());

grant select on public.ai_report_log_settings to authenticated;

create or replace function public.update_ai_report_log_settings(
  p_include_navigation boolean,
  p_include_authentication boolean,
  p_include_data_changes boolean,
  p_include_admin_audit boolean
)
returns public.ai_report_log_settings
language plpgsql
security definer
set search_path = public
as $$
declare
  v_settings public.ai_report_log_settings;
begin
  if not public.is_global_admin() then
    raise exception 'Global administrator access is required.';
  end if;

  insert into public.ai_report_log_settings (
    id,
    include_navigation,
    include_authentication,
    include_data_changes,
    include_admin_audit,
    updated_by,
    updated_at
  )
  values (
    true,
    coalesce(p_include_navigation, false),
    coalesce(p_include_authentication, false),
    coalesce(p_include_data_changes, false),
    coalesce(p_include_admin_audit, false),
    auth.uid(),
    clock_timestamp()
  )
  on conflict (id) do update
  set include_navigation = excluded.include_navigation,
      include_authentication = excluded.include_authentication,
      include_data_changes = excluded.include_data_changes,
      include_admin_audit = excluded.include_admin_audit,
      updated_by = excluded.updated_by,
      updated_at = excluded.updated_at
  returning * into v_settings;

  return v_settings;
end;
$$;

revoke all on function public.update_ai_report_log_settings(
  boolean,
  boolean,
  boolean,
  boolean
) from public, anon;
grant execute on function public.update_ai_report_log_settings(
  boolean,
  boolean,
  boolean,
  boolean
) to authenticated;

notify pgrst, 'reload schema';
