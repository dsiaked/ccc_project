-- =========================================================
-- CCC Bus simulation: preflight and global admin
-- Checks required objects and grants the configured real account global admin.
-- Run files in sql/simulation/README.md order.
-- =========================================================

begin;

create extension if not exists "pgcrypto";

-- =========================================================
-- 0. Rehearsal settings
-- =========================================================

-- Settings are intentionally repeated as literals below instead of using
-- temporary parameter objects. This avoids SQL Editor session/chunk issues.
-- Global admin email: admin@gmail.com
-- Reservation deadline: seven days after execution
-- Bus ticket price: 10000
-- Simulation password: Simulation123!

do $$
begin
  if to_regclass('public.campus_options') is null
    or to_regclass('public.profiles') is null
    or to_regclass('public.reservations') is null
    or to_regclass('public.payments') is null
    or to_regclass('public.admin_roles') is null
    or to_regclass('public.campus_request_messages') is null
    or to_regclass('public.campus_requests') is null
    or to_regclass('public.campus_transfers') is null
    or to_regclass('public.bus_allocations') is null
    or to_regclass('public.bus_options') is null
    or to_regclass('public.districts') is null
    or to_regclass('public.teams') is null
    or to_regclass('public.campuses') is null
    or to_regclass('public.stations') is null
    or to_regclass('public.app_settings') is null
  then
    raise exception 'Required schema objects are missing. Apply supabase/migrations first.';
  end if;

  if to_regprocedure('public.handle_new_auth_user()') is null
    or not exists (
      select 1
      from pg_trigger
      where tgname = 'on_auth_user_created'
        and tgrelid = 'auth.users'::regclass
        and not tgisinternal
    )
  then
    raise exception 'The latest Auth profile trigger is missing. Apply supabase/migrations first.';
  end if;
end $$;

-- =========================================================
-- 1. Grant global admin to the real admin account
-- =========================================================

do $$
declare
  v_global_admin_email text;
  v_global_admin_count integer;
begin
  v_global_admin_email := 'admin@gmail.com';

  if v_global_admin_email = 'REPLACE_WITH_GLOBAL_ADMIN_EMAIL@example.com' then
    raise exception 'Set global_admin_email to the real test admin email before running this seed.';
  end if;

  select count(*)
  into v_global_admin_count
  from auth.users
  where email = v_global_admin_email;

  if v_global_admin_count <> 1 then
    raise exception 'Expected exactly one auth.users row for global_admin_email %, found %.',
      v_global_admin_email,
      v_global_admin_count;
  end if;
end $$;

insert into admin_roles (user_id, role)
select auth.users.id, 'global_admin'
from auth.users
where auth.users.email = 'admin@gmail.com'
on conflict do nothing;

-- Verification: this should return one row for the configured email.
select
  auth.users.email,
  admin_roles.role
from admin_roles
join auth.users on auth.users.id = admin_roles.user_id
where admin_roles.role = 'global_admin'
  and auth.users.email = 'admin@gmail.com'
order by admin_roles.created_at desc;

commit;
