-- =========================================================
-- Server-paginated global-admin personal ticket list.
-- =========================================================

create or replace function public.get_admin_personal_ticket_page(
  p_page integer default 1,
  p_page_size integer default 25,
  p_search text default '',
  p_status text default 'all',
  p_ticket text default 'all',
  p_admin_role text default 'all',
  p_campus_issue text default 'all',
  p_campus text default 'all'
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_page integer := greatest(coalesce(p_page, 1), 1);
  v_page_size integer := least(greatest(coalesce(p_page_size, 25), 1), 100);
  v_search text := trim(coalesce(p_search, ''));
  v_result jsonb;
begin
  if not public.is_global_admin() then
    raise exception 'Only global admins can manage personal tickets.';
  end if;

  with reservation_people as (
    select
      coalesce(nullif(reservation.data ->> 'id', ''), reservation.id::text) as id,
      reservation.id as db_id,
      reservation.user_id,
      profile.email,
      coalesce(
        nullif(reservation.data ->> 'name', ''),
        nullif(reservation.name, ''),
        profile.name,
        ''
      ) as name,
      coalesce(
        nullif(reservation.data ->> 'phone', ''),
        nullif(reservation.phone, ''),
        profile.phone,
        ''
      ) as phone,
      coalesce(
        nullif(reservation.data ->> 'district', ''),
        nullif(reservation.district, ''),
        profile.district,
        ''
      ) as district,
      coalesce(
        nullif(reservation.data ->> 'team', ''),
        nullif(reservation.team, ''),
        profile.team,
        ''
      ) as team,
      coalesce(
        nullif(reservation.data ->> 'campus', ''),
        nullif(reservation.campus, ''),
        profile.campus,
        ''
      ) as campus,
      coalesce(
        reservation.data -> 'stationPreferences',
        reservation.station_preferences,
        '[]'::jsonb
      ) as station_preferences,
      coalesce(reservation.status, nullif(reservation.data ->> 'status', ''), 'requested') as status,
      payment.status as payment_status,
      coalesce(
        nullif(reservation.confirmed_ticket, 'null'::jsonb),
        nullif(reservation.data -> 'confirmedTicket', 'null'::jsonb)
      ) as confirmed_ticket,
      coalesce(nullif(reservation.data ->> 'requestedAt', ''), reservation.created_at::text, '') as requested_at,
      coalesce(nullif(reservation.data ->> 'updatedAt', ''), reservation.updated_at::text) as updated_at,
      reservation.data as raw_data,
      true as has_reservation
    from public.reservations reservation
    left join public.profiles profile on profile.id = reservation.user_id
    left join public.payments payment on payment.reservation_id = reservation.id
  ),
  not_applied_people as (
    select
      'profile-' || profile.id::text as id,
      null::uuid as db_id,
      profile.id as user_id,
      profile.email,
      coalesce(profile.name, '') as name,
      coalesce(profile.phone, '') as phone,
      coalesce(profile.district, '') as district,
      coalesce(profile.team, '') as team,
      coalesce(profile.campus, '') as campus,
      '[]'::jsonb as station_preferences,
      'not_applied'::text as status,
      null::text as payment_status,
      null::jsonb as confirmed_ticket,
      ''::text as requested_at,
      null::text as updated_at,
      null::jsonb as raw_data,
      false as has_reservation
    from public.profiles profile
    where not exists (
      select 1
      from public.reservations reservation
      where reservation.user_id = profile.id
    )
  ),
  people as (
    select * from reservation_people
    union all
    select * from not_applied_people
  ),
  people_with_roles as (
    select
      person.*,
      coalesce(roles.admin_roles, '[]'::jsonb) as admin_roles,
      coalesce(roles.role_names, array[]::text[]) as role_names,
      (
        (person.has_reservation and person.status <> 'cancelled' and person.payment_status is distinct from 'completed')
        or person.status = 'not_applied'
      ) as has_campus_issue
    from people person
    left join lateral (
      select
        jsonb_agg(
          jsonb_build_object(
            'id', admin_role.id,
            'user_id', admin_role.user_id,
            'role', admin_role.role,
            'district', admin_role.district,
            'team', admin_role.team,
            'campus', admin_role.campus
          )
          order by admin_role.role, admin_role.id
        ) as admin_roles,
        array_agg(admin_role.role) as role_names
      from public.admin_roles admin_role
      where admin_role.user_id = person.user_id
    ) roles on true
  ),
  filtered as (
    select *
    from people_with_roles person
    where
      (p_status = 'all' or person.status = p_status)
      and (
        p_ticket = 'all'
        or (p_ticket = 'not_applied' and person.status = 'not_applied')
        or (p_ticket = 'confirmed' and person.confirmed_ticket is not null)
        or (
          p_ticket = 'pending'
          and person.has_reservation
          and person.status <> 'cancelled'
          and person.confirmed_ticket is null
        )
      )
      and (p_campus = 'all' or person.campus = p_campus)
      and (p_campus_issue = 'all' or person.has_campus_issue)
      and (
        p_admin_role = 'all'
        or (p_admin_role = 'general' and cardinality(person.role_names) = 0)
        or p_admin_role = any(person.role_names)
      )
      and (
        v_search = ''
        or concat_ws(
          ' ',
          person.name,
          person.email,
          person.phone,
          person.district,
          person.team,
          person.campus,
          person.station_preferences::text,
          person.confirmed_ticket::text
        ) ilike '%' || replace(v_search, '%', '\%') || '%'
      )
  ),
  page_rows as (
    select *
    from filtered
    order by campus collate "default", team collate "default", name collate "default", user_id
    offset (v_page - 1) * v_page_size
    limit v_page_size
  ),
  summary as (
    select
      count(*)::integer as total,
      count(*) filter (where status <> 'not_applied')::integer as applied,
      count(*) filter (
        where status not in ('cancelled', 'not_applied') and confirmed_ticket is not null
      )::integer as confirmed,
      count(*) filter (
        where status not in ('cancelled', 'not_applied') and confirmed_ticket is null
      )::integer as pending,
      count(*) filter (
        where status not in ('cancelled', 'not_applied') and payment_status = 'completed'
      )::integer as paid,
      count(*) filter (where status = 'cancelled')::integer as cancelled,
      count(*) filter (where status = 'not_applied')::integer as not_applied
    from people_with_roles
  ),
  campus_summary as (
    select
      person.campus as name,
      count(*) filter (where has_campus_issue)::integer as issue_count,
      count(*) filter (where status = 'not_applied')::integer as not_applied_count,
      count(*) filter (
        where has_reservation and status <> 'cancelled' and payment_status is distinct from 'completed'
      )::integer as unpaid_count,
      coalesce(
        (
          select jsonb_agg(
            jsonb_build_object(
              'user_id', admin_role.user_id,
              'name', coalesce(profile.name, ''),
              'phone', coalesce(profile.phone, ''),
              'email', profile.email
            )
            order by coalesce(profile.name, ''), admin_role.user_id
          )
          from public.admin_roles admin_role
          left join public.profiles profile on profile.id = admin_role.user_id
          where admin_role.role = 'campus_admin'
            and coalesce(admin_role.campus, '') = person.campus
        ),
        '[]'::jsonb
      ) as admins
    from people_with_roles person
    where person.campus <> ''
    group by person.campus
  )
  select jsonb_build_object(
    'items',
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'id', row.id,
            'db_id', row.db_id,
            'user_id', row.user_id,
            'email', row.email,
            'name', row.name,
            'phone', row.phone,
            'district', row.district,
            'team', row.team,
            'campus', row.campus,
            'station_preferences', row.station_preferences,
            'status', row.status,
            'payment_status', row.payment_status,
            'confirmed_ticket', row.confirmed_ticket,
            'requested_at', row.requested_at,
            'updated_at', row.updated_at,
            'raw_data', row.raw_data,
            'has_reservation', row.has_reservation,
            'admin_roles', row.admin_roles
          )
          order by row.campus collate "default", row.team collate "default", row.name collate "default", row.user_id
        )
        from page_rows row
      ),
      '[]'::jsonb
    ),
    'total', (select total from summary),
    'filtered_total', (select count(*) from filtered),
    'summary', (select to_jsonb(summary) from summary),
    'campuses',
    coalesce(
      (
        select jsonb_agg(to_jsonb(campus_summary) order by name collate "default")
        from campus_summary
      ),
      '[]'::jsonb
    )
  )
  into v_result;

  return v_result;
end;
$$;

revoke all on function public.get_admin_personal_ticket_page(integer, integer, text, text, text, text, text, text) from public, anon;
grant execute on function public.get_admin_personal_ticket_page(integer, integer, text, text, text, text, text, text) to authenticated;

notify pgrst, 'reload schema';
