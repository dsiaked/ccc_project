-- Restore profile creation after isolating the production OAuth signup failure.
-- Legacy production profiles require non-null name and phone values.

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_metadata jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  v_affiliation_type text :=
    case
      when v_metadata ->> 'affiliation_type' = 'external'
        then 'external'
      else 'seoul'
    end;
  v_invitation_codes text[] := array[]::text[];
begin
  insert into public.profiles (
    id, email, name, phone,
    district_id, district, team_id, team, campus_id, campus,
    affiliation_type, coordinator_name, coordinator_phone,
    account_source, updated_at
  )
  values (
    new.id,
    lower(new.email),
    coalesce(
      nullif(v_metadata ->> 'name', ''),
      nullif(v_metadata ->> 'full_name', ''),
      nullif(v_metadata ->> 'user_name', ''),
      ''
    ),
    coalesce(v_metadata ->> 'phone', ''),
    case when v_affiliation_type = 'seoul'
      then nullif(v_metadata ->> 'district_id', '')::uuid end,
    v_metadata ->> 'district',
    case when v_affiliation_type = 'seoul'
      then nullif(v_metadata ->> 'team_id', '')::uuid end,
    case when v_affiliation_type = 'seoul'
      then v_metadata ->> 'team' else '' end,
    case when v_affiliation_type = 'seoul'
      then nullif(v_metadata ->> 'campus_id', '')::uuid end,
    v_metadata ->> 'campus',
    v_affiliation_type,
    case when v_affiliation_type = 'external'
      then v_metadata ->> 'coordinator_name' end,
    case when v_affiliation_type = 'external'
      then v_metadata ->> 'coordinator_phone' end,
    'self_signup',
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
    affiliation_type = excluded.affiliation_type,
    coordinator_name = excluded.coordinator_name,
    coordinator_phone = excluded.coordinator_phone,
    updated_at = now();

  if jsonb_typeof(v_metadata -> 'invitation_codes') = 'array' then
    select coalesce(array_agg(value), array[]::text[])
    into v_invitation_codes
    from jsonb_array_elements_text(v_metadata -> 'invitation_codes') value;
  end if;

  if cardinality(v_invitation_codes) > 0 then
    perform public.redeem_admin_invitation_codes_for_user(
      new.id,
      v_invitation_codes
    );
  end if;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_auth_user();

notify pgrst, 'reload schema';
