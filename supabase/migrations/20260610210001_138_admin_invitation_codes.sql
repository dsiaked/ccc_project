-- =========================================================
-- Administrator invitation codes
-- =========================================================

create table if not exists public.admin_invitation_codes (
  id uuid primary key default gen_random_uuid(),
  code_hash bytea not null unique,
  code_hint text not null,
  role text not null check (role in ('campus_admin', 'boarding_manager')),
  campus_id uuid references public.campuses(id) on delete cascade,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default clock_timestamp(),
  expires_at timestamptz not null default (clock_timestamp() + interval '14 days'),
  used_by uuid references auth.users(id) on delete set null,
  used_at timestamptz,
  cancelled_by uuid references auth.users(id) on delete set null,
  cancelled_at timestamptz,
  constraint admin_invitation_codes_role_scope_check check (
    (role = 'campus_admin' and campus_id is not null)
    or (role = 'boarding_manager' and campus_id is null)
  ),
  constraint admin_invitation_codes_usage_check check (
    (used_by is null and used_at is null)
    or used_at is not null
  )
);

alter table public.admin_invitation_codes
  drop constraint if exists admin_invitation_codes_usage_check;
alter table public.admin_invitation_codes
  add constraint admin_invitation_codes_usage_check check (
    (used_by is null and used_at is null)
    or used_at is not null
  );

create index if not exists idx_admin_invitation_codes_created
  on public.admin_invitation_codes(created_at desc);
create index if not exists idx_admin_invitation_codes_campus
  on public.admin_invitation_codes(campus_id, created_at desc)
  where role = 'campus_admin';

alter table public.admin_invitation_codes enable row level security;

drop trigger if exists audit_admin_invitation_code_operation
  on public.admin_invitation_codes;
create trigger audit_admin_invitation_code_operation
after insert or update or delete on public.admin_invitation_codes
for each row execute function public.audit_admin_operation();

drop policy if exists "Global admins can view invitation codes"
  on public.admin_invitation_codes;
create policy "Global admins can view invitation codes"
on public.admin_invitation_codes for select to authenticated
using (public.is_global_admin());

grant select on public.admin_invitation_codes to authenticated;
revoke insert, update, delete on public.admin_invitation_codes
  from public, anon, authenticated;

create or replace function public.normalize_admin_invitation_code(p_code text)
returns text
language sql
immutable
set search_path = public
as $$
  select upper(regexp_replace(coalesce(p_code, ''), '[^a-zA-Z0-9]', '', 'g'));
$$;

revoke all on function public.normalize_admin_invitation_code(text)
  from public, anon, authenticated;

create or replace function public.validate_admin_invitation_codes(p_codes text[])
returns jsonb
language plpgsql
security definer
set search_path = public
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
    if v_invitation.used_at is not null then
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

revoke all on function public.validate_admin_invitation_codes(text[]) from public;
grant execute on function public.validate_admin_invitation_codes(text[])
  to anon, authenticated;

create or replace function public.redeem_admin_invitation_codes_for_user(
  p_user_id uuid,
  p_codes text[]
)
returns jsonb
language plpgsql
security definer
set search_path = public
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

    update public.admin_invitation_codes
    set used_by = p_user_id, used_at = clock_timestamp()
    where id = v_invitation.id;

    v_granted := v_granted || jsonb_build_array(jsonb_build_object(
      'role', v_invitation.role,
      'campusId', v_invitation.campus_id
    ));
  end loop;

  return jsonb_build_object('granted', v_granted);
end;
$$;

revoke all on function public.redeem_admin_invitation_codes_for_user(uuid, text[])
  from public, anon, authenticated;

create or replace function public.redeem_admin_invitation_codes(p_codes text[])
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Login is required.';
  end if;

  return public.redeem_admin_invitation_codes_for_user(auth.uid(), p_codes);
end;
$$;

revoke all on function public.redeem_admin_invitation_codes(text[])
  from public, anon;
grant execute on function public.redeem_admin_invitation_codes(text[])
  to authenticated;

create or replace function public.create_admin_invitation_code(
  p_role text,
  p_campus_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
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

  v_code := concat(
    substr(v_raw, 1, 6), '-',
    substr(v_raw, 7, 6), '-',
    substr(v_raw, 13, 6), '-',
    substr(v_raw, 19, 6)
  );

  insert into public.admin_invitation_codes (
    code_hash, code_hint, role, campus_id, created_by
  )
  values (
    digest(v_raw, 'sha256'),
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

revoke all on function public.create_admin_invitation_code(text, uuid)
  from public, anon;
grant execute on function public.create_admin_invitation_code(text, uuid)
  to authenticated;

create or replace function public.cancel_admin_invitation_code(p_invitation_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_updated_id uuid;
begin
  if not public.is_global_admin() then
    raise exception 'Only global admins can cancel invitation codes.';
  end if;

  update public.admin_invitation_codes
  set cancelled_by = auth.uid(), cancelled_at = clock_timestamp()
  where id = p_invitation_id
    and used_at is null
    and cancelled_at is null
    and expires_at > clock_timestamp()
  returning id into v_updated_id;

  return v_updated_id is not null;
end;
$$;

revoke all on function public.cancel_admin_invitation_code(uuid)
  from public, anon;
grant execute on function public.cancel_admin_invitation_code(uuid)
  to authenticated;

create or replace function public.cleanup_admin_invitation_codes()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_deleted_invitations integer;
  v_deleted_audit_logs integer;
begin
  if not public.is_global_admin() then
    raise exception 'Only global admins can clean up invitation codes.';
  end if;

  delete from public.admin_invitation_codes invitation
  where invitation.cancelled_at is not null
    or (
      invitation.used_at is null
      and invitation.expires_at <= clock_timestamp()
    )
    or invitation.used_at <= clock_timestamp() - interval '30 days';

  get diagnostics v_deleted_invitations = row_count;

  delete from public.admin_action_audit_logs audit_log
  where audit_log.resource_type = 'admin_invitation_codes'
    and audit_log.created_at <= clock_timestamp() - interval '1 year';

  get diagnostics v_deleted_audit_logs = row_count;

  return jsonb_build_object(
    'deletedInvitations', v_deleted_invitations,
    'deletedAuditLogs', v_deleted_audit_logs
  );
end;
$$;

revoke all on function public.cleanup_admin_invitation_codes()
  from public, anon;
grant execute on function public.cleanup_admin_invitation_codes()
  to authenticated;

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
    affiliation_type = excluded.affiliation_type,
    coordinator_name = excluded.coordinator_name,
    coordinator_phone = excluded.coordinator_phone,
    account_source = excluded.account_source,
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
