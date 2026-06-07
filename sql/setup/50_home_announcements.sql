-- =========================================================
-- Home announcements
-- =========================================================

create table if not exists home_announcements (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  content text not null,
  is_published boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_home_announcements_published_created_at
  on home_announcements(is_published, created_at desc);

drop trigger if exists set_home_announcements_updated_at on home_announcements;

create trigger set_home_announcements_updated_at
before update on home_announcements
for each row
execute function set_updated_at();

alter table home_announcements enable row level security;

drop policy if exists "Anyone can view published home announcements" on home_announcements;
drop policy if exists "Global admins can view all home announcements" on home_announcements;
drop policy if exists "Global admins can manage home announcements" on home_announcements;

create policy "Anyone can view published home announcements"
on home_announcements
for select
to anon, authenticated
using (is_published = true);

create policy "Global admins can view all home announcements"
on home_announcements
for select
to authenticated
using (
  exists (
    select 1
    from admin_roles
    where admin_roles.user_id = auth.uid()
      and admin_roles.role = 'global_admin'
  )
);

revoke insert, update, delete on table public.home_announcements from public, anon, authenticated;
