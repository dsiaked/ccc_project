-- =========================================================
-- Shared app settings
-- Run after 00_base_schema_and_rls.sql.
--
-- Purpose:
-- - central key/value settings table used by multiple features
-- - examples: bus ticket price, first reservation deadline
-- =========================================================

create table if not exists app_settings (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table app_settings add column if not exists value jsonb not null default '{}'::jsonb;
alter table app_settings add column if not exists created_at timestamptz not null default now();
alter table app_settings add column if not exists updated_at timestamptz not null default now();

create or replace function set_app_settings_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists set_app_settings_updated_at on app_settings;

create trigger set_app_settings_updated_at
before update on app_settings
for each row
execute function set_app_settings_updated_at();

insert into app_settings (key, value)
values
  ('bus_ticket_price', '{"price": 0}'::jsonb),
  ('first_reservation_deadline', '{"deadline_at": null}'::jsonb)
on conflict (key) do nothing;

alter table app_settings enable row level security;

drop policy if exists "Authenticated users can view app settings" on app_settings;
drop policy if exists "Global admins can manage app settings" on app_settings;

create policy "Authenticated users can view app settings"
on app_settings
for select
to authenticated
using (true);

create policy "Global admins can manage app settings"
on app_settings
for all
to authenticated
using (
  exists (
    select 1
    from admin_roles
    where admin_roles.user_id = auth.uid()
      and admin_roles.role = 'global_admin'
  )
)
with check (
  exists (
    select 1
    from admin_roles
    where admin_roles.user_id = auth.uid()
      and admin_roles.role = 'global_admin'
  )
);
