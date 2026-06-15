-- Keep the admin-created account marker behind a trusted service-role write.
-- Auth user metadata is user-controlled during self-signup and must not set it.

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_affiliation_type text :=
    case
      when new.raw_user_meta_data ->> 'affiliation_type' = 'external'
        then 'external'
      else 'seoul'
    end;
  v_invitation_codes text[];
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
    new.raw_user_meta_data ->> 'name',
    new.raw_user_meta_data ->> 'phone',
    case when v_affiliation_type = 'seoul'
      then nullif(new.raw_user_meta_data ->> 'district_id', '')::uuid end,
    new.raw_user_meta_data ->> 'district',
    case when v_affiliation_type = 'seoul'
      then nullif(new.raw_user_meta_data ->> 'team_id', '')::uuid end,
    case when v_affiliation_type = 'seoul'
      then new.raw_user_meta_data ->> 'team' else '' end,
    case when v_affiliation_type = 'seoul'
      then nullif(new.raw_user_meta_data ->> 'campus_id', '')::uuid end,
    new.raw_user_meta_data ->> 'campus',
    v_affiliation_type,
    case when v_affiliation_type = 'external'
      then new.raw_user_meta_data ->> 'coordinator_name' end,
    case when v_affiliation_type = 'external'
      then new.raw_user_meta_data ->> 'coordinator_phone' end,
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

  select coalesce(array_agg(value), array[]::text[])
  into v_invitation_codes
  from jsonb_array_elements_text(
    coalesce(new.raw_user_meta_data -> 'invitation_codes', '[]'::jsonb)
  ) value;

  perform public.redeem_admin_invitation_codes_for_user(
    new.id,
    v_invitation_codes
  );

  return new;
end;
$$;

notify pgrst, 'reload schema';
