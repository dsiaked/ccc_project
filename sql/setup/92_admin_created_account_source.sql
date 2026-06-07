-- =========================================================
-- Track whether an account was created by the user or an administrator.
-- Existing accounts remain self_signup because their origin cannot be
-- determined reliably from the currently stored data.
-- =========================================================

alter table public.profiles
  add column if not exists account_source text not null default 'self_signup';

update public.profiles
set account_source = 'self_signup'
where account_source not in ('self_signup', 'admin_created');

alter table public.profiles
  drop constraint if exists profiles_account_source_check;

alter table public.profiles
  add constraint profiles_account_source_check
  check (account_source in ('self_signup', 'admin_created'));

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
    account_source, updated_at
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
    case
      when new.raw_user_meta_data ->> 'account_source' = 'admin_created'
        then 'admin_created'
      else 'self_signup'
    end,
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
    account_source = excluded.account_source,
    updated_at = now();

  return new;
end;
$$;

notify pgrst, 'reload schema';
