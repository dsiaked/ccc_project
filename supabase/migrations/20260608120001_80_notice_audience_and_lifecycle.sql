-- Targeted campus notices and announcement lifecycle controls.

alter table public.campus_requests
  add column if not exists is_archived boolean not null default false;

create table if not exists public.campus_notice_targets (
  notice_id uuid not null references public.campus_requests(id) on delete cascade,
  district text not null,
  team text not null,
  campus text not null,
  created_at timestamptz not null default now(),
  primary key (notice_id, district, team, campus)
);

create index if not exists idx_campus_notice_targets_scope
  on public.campus_notice_targets(district, team, campus);

alter table public.campus_notice_targets enable row level security;

insert into public.campus_notice_targets (notice_id, district, team, campus)
select notice.id, option.district, option.team, option.campus
from public.campus_requests notice
cross join public.campus_options option
where notice.is_global_notice = true
on conflict do nothing;

drop policy if exists "Admins can view campus notice targets" on public.campus_notice_targets;
create policy "Admins can view campus notice targets"
on public.campus_notice_targets
for select
to authenticated
using (
  public.is_global_admin()
  or exists (
    select 1
    from public.admin_roles
    where admin_roles.user_id = auth.uid()
      and admin_roles.role = 'campus_admin'
      and admin_roles.district = campus_notice_targets.district
      and admin_roles.team = campus_notice_targets.team
      and admin_roles.campus = campus_notice_targets.campus
  )
);

drop policy if exists "Admins can view campus requests" on public.campus_requests;
create policy "Admins can view campus requests"
on public.campus_requests
for select
to authenticated
using (
  public.is_global_admin()
  or (
    campus_requests.is_global_notice = true
    and campus_requests.is_archived = false
    and exists (
      select 1
      from public.admin_roles
      where admin_roles.user_id = auth.uid()
        and admin_roles.role = 'campus_admin'
        and exists (
          select 1
          from public.campus_notice_targets
          where campus_notice_targets.notice_id = campus_requests.id
            and campus_notice_targets.district = admin_roles.district
            and campus_notice_targets.team = admin_roles.team
            and campus_notice_targets.campus = admin_roles.campus
        )
    )
  )
  or (
    campus_requests.is_global_notice = false
    and exists (
      select 1
      from public.admin_roles
      where admin_roles.user_id = auth.uid()
        and admin_roles.role = 'campus_admin'
        and admin_roles.district = campus_requests.district
        and admin_roles.team = campus_requests.team
        and admin_roles.campus = campus_requests.campus
    )
  )
);

create or replace function public.get_global_campus_notices()
returns setof public.campus_requests
language plpgsql security definer set search_path = public
as $$
begin
  if not exists (
    select 1 from public.admin_roles
    where admin_roles.user_id = auth.uid()
      and admin_roles.role in ('global_admin', 'campus_admin')
  ) then
    raise exception 'Only admins can view campus notices.';
  end if;

  return query
  select notice.*
  from public.campus_requests notice
  where notice.is_global_notice = true
    and (
      public.is_global_admin()
      or (
        notice.is_archived = false
        and exists (
          select 1
          from public.campus_notice_targets target
          join public.admin_roles role
            on role.user_id = auth.uid()
           and role.role = 'campus_admin'
           and role.district = target.district
           and role.team = target.team
           and role.campus = target.campus
          where target.notice_id = notice.id
        )
      )
    )
  order by notice.created_at desc;
end;
$$;

create or replace function public.create_targeted_campus_notice(
  p_title text,
  p_content text,
  p_targets jsonb
)
returns public.campus_requests
language plpgsql security definer set search_path = public
as $$
declare
  v_notice public.campus_requests;
begin
  if not public.is_global_admin() then
    raise exception 'Only global admins can create campus notices.';
  end if;
  if nullif(trim(p_title), '') is null or nullif(trim(p_content), '') is null then
    raise exception 'Notice title and content are required.';
  end if;
  if jsonb_typeof(p_targets) <> 'array' or jsonb_array_length(p_targets) = 0 then
    raise exception 'At least one campus target is required.';
  end if;

  insert into public.campus_requests (
    type, status, title, content, is_global_notice,
    district, team, campus, created_by
  )
  values ('notice', 'open', trim(p_title), trim(p_content), true, '대상 지정', '대상 지정', '대상 지정', auth.uid())
  returning * into v_notice;

  insert into public.campus_notice_targets (notice_id, district, team, campus)
  select distinct
    v_notice.id,
    trim(target ->> 'district'),
    trim(target ->> 'team'),
    trim(target ->> 'campus')
  from jsonb_array_elements(p_targets) target
  where nullif(trim(target ->> 'district'), '') is not null
    and nullif(trim(target ->> 'team'), '') is not null
    and nullif(trim(target ->> 'campus'), '') is not null;

  if not exists (
    select 1 from public.campus_notice_targets where notice_id = v_notice.id
  ) then
    raise exception 'No valid campus targets were provided.';
  end if;

  return v_notice;
end;
$$;

create or replace function public.update_targeted_campus_notice(
  p_notice_id uuid,
  p_title text,
  p_content text,
  p_targets jsonb,
  p_archived boolean default false
)
returns public.campus_requests
language plpgsql security definer set search_path = public
as $$
declare
  v_notice public.campus_requests;
begin
  if not public.is_global_admin() then
    raise exception 'Only global admins can update campus notices.';
  end if;

  update public.campus_requests
  set title = trim(p_title),
      content = trim(p_content),
      is_archived = p_archived,
      updated_at = now()
  where id = p_notice_id and is_global_notice = true
  returning * into v_notice;

  if v_notice.id is null then raise exception 'Campus notice not found.'; end if;

  delete from public.campus_notice_targets where notice_id = p_notice_id;
  insert into public.campus_notice_targets (notice_id, district, team, campus)
  select distinct p_notice_id, trim(target ->> 'district'), trim(target ->> 'team'), trim(target ->> 'campus')
  from jsonb_array_elements(p_targets) target
  where nullif(trim(target ->> 'district'), '') is not null
    and nullif(trim(target ->> 'team'), '') is not null
    and nullif(trim(target ->> 'campus'), '') is not null;

  delete from public.campus_notice_reads where notice_id = p_notice_id;
  return v_notice;
end;
$$;

revoke all on function public.create_targeted_campus_notice(text, text, jsonb) from public, anon;
revoke all on function public.update_targeted_campus_notice(uuid, text, text, jsonb, boolean) from public, anon;
grant execute on function public.create_targeted_campus_notice(text, text, jsonb) to authenticated;
grant execute on function public.update_targeted_campus_notice(uuid, text, text, jsonb, boolean) to authenticated;

alter table public.home_announcements
  add column if not exists is_archived boolean not null default false,
  add column if not exists is_pinned boolean not null default false,
  add column if not exists publish_start_at timestamptz,
  add column if not exists publish_end_at timestamptz;

drop policy if exists "Anyone can view published home announcements" on public.home_announcements;
create policy "Anyone can view published home announcements"
on public.home_announcements
for select
to anon, authenticated
using (
  is_published = true
  and is_archived = false
  and (publish_start_at is null or publish_start_at <= now())
  and (publish_end_at is null or publish_end_at > now())
);

create or replace function public.update_home_announcement_as_global_admin(
  p_id uuid,
  p_title text,
  p_content text,
  p_is_published boolean,
  p_is_archived boolean,
  p_is_pinned boolean,
  p_publish_start_at timestamptz,
  p_publish_end_at timestamptz
)
returns public.home_announcements
language plpgsql security definer set search_path = public
as $$
declare v_row public.home_announcements;
begin
  if not public.is_global_admin() then raise exception 'Only global admins can update home announcements.'; end if;
  update public.home_announcements
  set title = trim(p_title),
      content = trim(p_content),
      is_published = p_is_published,
      is_archived = p_is_archived,
      is_pinned = p_is_pinned,
      publish_start_at = p_publish_start_at,
      publish_end_at = p_publish_end_at,
      updated_at = now()
  where id = p_id
  returning * into v_row;
  if v_row.id is null then raise exception 'Home announcement not found.'; end if;
  return v_row;
end;
$$;

revoke all on function public.update_home_announcement_as_global_admin(uuid, text, text, boolean, boolean, boolean, timestamptz, timestamptz) from public, anon;
grant execute on function public.update_home_announcement_as_global_admin(uuid, text, text, boolean, boolean, boolean, timestamptz, timestamptz) to authenticated;

notify pgrst, 'reload schema';
