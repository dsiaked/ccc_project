-- =========================================================
-- Server-paginated user list with the selected campus administrator first.
-- =========================================================

create or replace function public.get_campus_admin_manage_users_page(
  p_district text default null,
  p_team text default null,
  p_campus text default null,
  p_limit integer default 50,
  p_offset integer default 0
)
returns table (
  user_id uuid,
  email text,
  name text,
  phone text,
  district text,
  team text,
  campus text,
  role text,
  admin_role_id uuid,
  managed_campuses jsonb,
  total_count bigint
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_global_admin() then
    raise exception 'Only global admins can manage campus administrators.';
  end if;

  return query
  with candidate_ids as (
    select profile.id
    from public.profiles profile
    where (nullif(trim(p_district), '') is null or profile.district = trim(p_district))
      and (nullif(trim(p_team), '') is null or profile.team = trim(p_team))
      and (nullif(trim(p_campus), '') is null or profile.campus = trim(p_campus))

    union

    select admin_role.user_id
    from public.admin_roles admin_role
    where admin_role.role = 'campus_admin'
      and (nullif(trim(p_district), '') is null or admin_role.district = trim(p_district))
      and (nullif(trim(p_team), '') is null or admin_role.team = trim(p_team))
      and (nullif(trim(p_campus), '') is null or admin_role.campus = trim(p_campus))
  ),
  candidates as (
    select
      profile.id,
      profile.email,
      profile.name,
      profile.phone,
      profile.district,
      profile.team,
      profile.campus,
      case
        when exists (
          select 1
          from public.admin_roles matching_role
          where matching_role.user_id = profile.id
            and matching_role.role = 'campus_admin'
            and (nullif(trim(p_district), '') is null or matching_role.district = trim(p_district))
            and (nullif(trim(p_team), '') is null or matching_role.team = trim(p_team))
            and (nullif(trim(p_campus), '') is null or matching_role.campus = trim(p_campus))
        ) then 0
        else 1
      end as campus_admin_priority,
      count(*) over () as total_count
    from public.profiles profile
    join candidate_ids candidate on candidate.id = profile.id
    order by campus_admin_priority, profile.name asc nulls last, profile.email asc nulls last, profile.id
    limit least(greatest(coalesce(p_limit, 50), 1), 100)
    offset greatest(coalesce(p_offset, 0), 0)
  )
  select
    candidate.id as user_id,
    candidate.email,
    coalesce(candidate.name, '이름 없음') as name,
    candidate.phone,
    coalesce(selected_role.district, candidate.district) as district,
    coalesce(selected_role.team, candidate.team) as team,
    coalesce(selected_role.campus, candidate.campus) as campus,
    selected_role.role,
    selected_role.id as admin_role_id,
    coalesce(managed_roles.scopes, '[]'::jsonb) as managed_campuses,
    candidate.total_count
  from candidates candidate
  left join lateral (
    select admin_role.id, admin_role.role, admin_role.district, admin_role.team, admin_role.campus
    from public.admin_roles admin_role
    where admin_role.user_id = candidate.id
    order by
      case
        when admin_role.role = 'global_admin' then 0
        when admin_role.role = 'campus_admin'
          and admin_role.district is not distinct from nullif(trim(p_district), '')
          and admin_role.team is not distinct from nullif(trim(p_team), '')
          and admin_role.campus is not distinct from nullif(trim(p_campus), '')
          then 1
        else 2
      end,
      admin_role.updated_at desc nulls last,
      admin_role.created_at desc nulls last
    limit 1
  ) selected_role on true
  left join lateral (
    select jsonb_agg(
      jsonb_build_object(
        'id', admin_role.id,
        'district', admin_role.district,
        'team', admin_role.team,
        'campus', admin_role.campus
      )
      order by admin_role.district, admin_role.team, admin_role.campus
    ) as scopes
    from public.admin_roles admin_role
    where admin_role.user_id = candidate.id
      and admin_role.role = 'campus_admin'
  ) managed_roles on true
  order by
    candidate.campus_admin_priority,
    candidate.name asc nulls last,
    candidate.email asc nulls last,
    candidate.id;
end;
$$;

revoke all on function public.get_campus_admin_manage_users_page(text, text, text, integer, integer)
from public, anon;
grant execute on function public.get_campus_admin_manage_users_page(text, text, text, integer, integer)
to authenticated;

notify pgrst, 'reload schema';
