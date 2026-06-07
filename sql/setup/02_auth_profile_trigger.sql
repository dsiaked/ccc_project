-- Run this patch on an existing Supabase project.
-- It creates profiles in the same transaction as new Auth users, so signup
-- does not depend on a browser session or profiles RLS.

create or replace function public.email_exists(p_email text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from auth.users
    where lower(auth.users.email) = lower(trim(p_email))
  );
$$;

revoke all on function public.email_exists(text) from public;
grant execute on function public.email_exists(text) to anon, authenticated;

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (
    id, email, name, phone,
    district_id, district, team_id, team, campus_id, campus,
    updated_at
  )
  values (
    new.id,
    lower(new.email),
    new.raw_user_meta_data ->> 'name',
    new.raw_user_meta_data ->> 'phone',
    nullif(new.raw_user_meta_data ->> 'district_id', '')::uuid,
    new.raw_user_meta_data ->> 'district',
    nullif(new.raw_user_meta_data ->> 'team_id', '')::uuid,
    new.raw_user_meta_data ->> 'team',
    nullif(new.raw_user_meta_data ->> 'campus_id', '')::uuid,
    new.raw_user_meta_data ->> 'campus',
    now()
  )
  on conflict (id) do update
  set
    email = excluded.email,
    name = excluded.name,
    phone = excluded.phone,
    district_id = excluded.district_id,
    district = excluded.district,
    team_id = excluded.team_id,
    team = excluded.team,
    campus_id = excluded.campus_id,
    campus = excluded.campus,
    updated_at = now();

  return new;
end;
$$;

do $$
begin
  if not exists (
    select 1
    from pg_trigger
    where tgname = 'on_auth_user_created'
      and tgrelid = 'auth.users'::regclass
      and not tgisinternal
  ) then
    create trigger on_auth_user_created
    after insert on auth.users
    for each row execute function public.handle_new_auth_user();
  end if;
exception
  when insufficient_privilege then
    raise exception using
      message = 'Cannot create auth.users trigger with the current database role.',
      hint = 'Run this patch once in the Supabase Dashboard SQL Editor as the postgres role. Do not change the owner of auth.users.';
end $$;

insert into public.profiles (
  id, email, name, phone,
  district_id, district, team_id, team, campus_id, campus,
  updated_at
)
select
  users.id,
  lower(users.email),
  users.raw_user_meta_data ->> 'name',
  users.raw_user_meta_data ->> 'phone',
  nullif(users.raw_user_meta_data ->> 'district_id', '')::uuid,
  users.raw_user_meta_data ->> 'district',
  nullif(users.raw_user_meta_data ->> 'team_id', '')::uuid,
  users.raw_user_meta_data ->> 'team',
  nullif(users.raw_user_meta_data ->> 'campus_id', '')::uuid,
  users.raw_user_meta_data ->> 'campus',
  now()
from auth.users as users
where not exists (
  select 1 from public.profiles where profiles.id = users.id
)
on conflict (id) do nothing;

notify pgrst, 'reload schema';
