-- Make boarding manager invitation codes reusable by multiple people and restrict to at most one active code at any time.

-- 1. Redefine create_admin_invitation_code to restrict boarding_manager active codes to at most 1.
create or replace function public.create_admin_invitation_code(
  p_role text,
  p_campus_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_raw text := upper(encode(gen_random_bytes(12), 'hex'));
  v_code text;
  v_invitation public.admin_invitation_codes%rowtype;
begin
  if not public.is_global_admin() then
    raise exception 'Only global admins can create invitation codes.';
  end if;
  if p_role not in ('campus_admin', 'boarding_manager') then
    raise exception 'Unsupported invitation role.';
  end if;
  if p_role = 'campus_admin' and p_campus_id is null then
    raise exception 'Campus administrator invitations require a campus.';
  end if;
  if p_role = 'boarding_manager' and p_campus_id is not null then
    raise exception 'Boarding manager invitations cannot have a campus.';
  end if;
  if p_role = 'campus_admin' and not exists (
    select 1 from public.campuses where id = p_campus_id
  ) then
    raise exception 'Campus was not found.';
  end if;
  if p_role = 'campus_admin' then
    perform pg_advisory_xact_lock(
      hashtextextended('admin-invitation-campus:' || p_campus_id::text, 0)
    );
  end if;
  if p_role = 'campus_admin' and exists (
    select 1 from public.admin_roles role
    where role.role = 'campus_admin' and role.campus_id = p_campus_id
  ) then
    raise exception 'This campus already has an active campus administrator.';
  end if;
  if p_role = 'campus_admin' and exists (
    select 1 from public.admin_invitation_codes invitation
    where invitation.role = 'campus_admin'
      and invitation.campus_id = p_campus_id
      and invitation.used_at is null
      and invitation.cancelled_at is null
      and invitation.expires_at > clock_timestamp()
  ) then
    raise exception 'This campus already has an active invitation code.';
  end if;

  -- 탑승 관리 간사님의 경우, 이미 사용 가능한(활성) 코드가 존재한다면 추가 생성을 방지합니다.
  if p_role = 'boarding_manager' and exists (
    select 1 from public.admin_invitation_codes invitation
    where invitation.role = 'boarding_manager'
      and invitation.used_at is null
      and invitation.cancelled_at is null
      and invitation.expires_at > clock_timestamp()
  ) then
    raise exception 'There is already an active boarding manager invitation code.';
  end if;

  v_code := concat(
    substr(v_raw, 1, 6), '-',
    substr(v_raw, 7, 6), '-',
    substr(v_raw, 13, 6), '-',
    substr(v_raw, 19, 6)
  );

  insert into public.admin_invitation_codes (
    code_hash, code, code_hint, role, campus_id, created_by
  )
  values (
    digest(v_raw, 'sha256'),
    v_code,
    concat(substr(v_raw, 1, 4), '-****-', substr(v_raw, 21, 4)),
    p_role,
    p_campus_id,
    auth.uid()
  )
  returning * into v_invitation;

  return jsonb_build_object(
    'id', v_invitation.id,
    'code', v_code,
    'expiresAt', v_invitation.expires_at
  );
end;
$$;

-- 2. Redefine validate_admin_invitation_codes to skip used_at check for boarding_manager codes.
create or replace function public.validate_admin_invitation_codes(p_codes text[])
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_codes text[] := coalesce(p_codes, array[]::text[]);
  v_normalized text;
  v_invitation public.admin_invitation_codes%rowtype;
  v_index integer;
  v_results jsonb := '[]'::jsonb;
  v_campus_name text;
begin
  if cardinality(v_codes) > 10 then
    return jsonb_build_object(
      'valid', false,
      'errorCode', 'too_many_codes',
      'errorMessage', 'Up to 10 invitation codes can be used at once.'
    );
  end if;

  for v_index in 1..cardinality(v_codes) loop
    v_normalized := public.normalize_admin_invitation_code(v_codes[v_index]);

    if char_length(v_normalized) <> 24 then
      return jsonb_build_object(
        'valid', false,
        'errorCode', 'invalid_code',
        'errorIndex', v_index,
        'errorMessage', 'Invitation code is invalid.'
      );
    end if;

    if exists (
      select 1
      from unnest(v_codes[1:v_index - 1]) previous_code
      where public.normalize_admin_invitation_code(previous_code) = v_normalized
    ) then
      return jsonb_build_object(
        'valid', false,
        'errorCode', 'duplicate_code',
        'errorIndex', v_index,
        'errorMessage', 'The same invitation code was entered more than once.'
      );
    end if;

    select * into v_invitation
    from public.admin_invitation_codes invitation
    where invitation.code_hash = digest(v_normalized, 'sha256');

    if not found then
      return jsonb_build_object(
        'valid', false,
        'errorCode', 'invalid_code',
        'errorIndex', v_index,
        'errorMessage', 'Invitation code is invalid.'
      );
    end if;
    if v_invitation.cancelled_at is not null then
      return jsonb_build_object(
        'valid', false,
        'errorCode', 'cancelled_code',
        'errorIndex', v_index,
        'errorMessage', 'Invitation code was cancelled.'
      );
    end if;

    -- 탑승 관리 간사님의 경우 다회용 코드이므로 이미 사용되었는지(used_at) 확인하지 않습니다.
    if v_invitation.role <> 'boarding_manager' and v_invitation.used_at is not null then
      return jsonb_build_object(
        'valid', false,
        'errorCode', 'used_code',
        'errorIndex', v_index,
        'errorMessage', 'Invitation code was already used.'
      );
    end if;
    if v_invitation.expires_at <= clock_timestamp() then
      return jsonb_build_object(
        'valid', false,
        'errorCode', 'expired_code',
        'errorIndex', v_index,
        'errorMessage', 'Invitation code expired.'
      );
    end if;

    if v_invitation.role = 'campus_admin' and exists (
      select 1 from public.admin_roles role
      where role.role = 'campus_admin'
        and role.campus_id = v_invitation.campus_id
    ) then
      return jsonb_build_object(
        'valid', false,
        'errorCode', 'campus_already_assigned',
        'errorIndex', v_index,
        'errorMessage', 'This campus already has an active campus administrator.'
      );
    end if;

    select campus.name into v_campus_name
    from public.campuses campus
    where campus.id = v_invitation.campus_id;

    v_results := v_results || jsonb_build_array(jsonb_build_object(
      'index', v_index,
      'role', v_invitation.role,
      'campusId', v_invitation.campus_id,
      'campus', v_campus_name
    ));
  end loop;

  return jsonb_build_object('valid', true, 'invitations', v_results);
end;
$$;

-- 3. Redefine redeem_admin_invitation_codes_for_user to avoid setting used_at/used_by for boarding_manager codes.
create or replace function public.redeem_admin_invitation_codes_for_user(
  p_user_id uuid,
  p_codes text[]
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_validation jsonb;
  v_code text;
  v_normalized text;
  v_invitation public.admin_invitation_codes%rowtype;
  v_campus record;
  v_granted jsonb := '[]'::jsonb;
begin
  if p_user_id is null or not exists (
    select 1 from auth.users where id = p_user_id
  ) then
    raise exception 'Invitation code user was not found.';
  end if;

  if cardinality(coalesce(p_codes, array[]::text[])) = 0 then
    return jsonb_build_object('granted', v_granted);
  end if;

  perform 1
  from public.admin_invitation_codes invitation
  where invitation.code_hash in (
    select digest(public.normalize_admin_invitation_code(code), 'sha256')
    from unnest(p_codes) code
  )
  order by invitation.id
  for update;

  v_validation := public.validate_admin_invitation_codes(p_codes);
  if not coalesce((v_validation ->> 'valid')::boolean, false) then
    raise exception '%', v_validation ->> 'errorMessage';
  end if;

  foreach v_code in array p_codes loop
    v_normalized := public.normalize_admin_invitation_code(v_code);

    select * into strict v_invitation
    from public.admin_invitation_codes invitation
    where invitation.code_hash = digest(v_normalized, 'sha256');

    if v_invitation.role = 'campus_admin' then
      select
        district.id as district_id,
        district.name as district,
        team.id as team_id,
        team.name as team,
        campus.id as campus_id,
        campus.name as campus
      into strict v_campus
      from public.campuses campus
      join public.teams team on team.id = campus.team_id
      join public.districts district on district.id = team.district_id
      where campus.id = v_invitation.campus_id;

      insert into public.admin_roles (
        user_id, role,
        district_id, district, team_id, team, campus_id, campus,
        granted_by, updated_at
      )
      values (
        p_user_id, 'campus_admin',
        v_campus.district_id, v_campus.district,
        v_campus.team_id, v_campus.team,
        v_campus.campus_id, v_campus.campus,
        v_invitation.created_by, clock_timestamp()
      );
    else
      if exists (
        select 1 from public.admin_roles role
        where role.user_id = p_user_id
          and role.role = 'boarding_manager'
      ) then
        raise exception 'This user is already a boarding manager.';
      end if;

      insert into public.admin_roles (
        user_id, role, granted_by, updated_at
      )
      values (
        p_user_id, 'boarding_manager',
        v_invitation.created_by, clock_timestamp()
      );
    end if;

    -- 탑승 관리 간사님의 경우 다회용 코드이므로 used_at, used_by를 기록하여 코드를 비활성화하지 않습니다.
    if v_invitation.role <> 'boarding_manager' then
      update public.admin_invitation_codes
      set used_by = p_user_id, used_at = clock_timestamp()
      where id = v_invitation.id;
    end if;

    v_granted := v_granted || jsonb_build_array(jsonb_build_object(
      'role', v_invitation.role,
      'campusId', v_invitation.campus_id
    ));
  end loop;

  return jsonb_build_object('granted', v_granted);
end;
$$;
