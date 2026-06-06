-- =========================================================
-- Campus request board
-- Run this in Supabase SQL Editor.
--
-- Purpose:
-- - campus admins can submit post-deadline questions/requests
-- - global admins can view, answer, and change status
-- - campus/global admins can exchange messages inside each request
-- =========================================================

create extension if not exists "pgcrypto";

create table if not exists campus_requests (
  id uuid primary key default gen_random_uuid(),
  type text not null default 'etc',
  status text not null default 'open',
  title text not null,
  content text not null,
  admin_response text,
  is_global_notice boolean not null default false,
  district_id uuid references districts(id),
  team_id uuid references teams(id),
  campus_id uuid references campuses(id),
  district text not null,
  team text not null,
  campus text not null,
  created_by uuid not null,
  handled_by uuid,
  handled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint campus_requests_type_check check (
    type in (
      'late_signup',
      'notice',
      'cancel_refund',
      'payment_issue',
      'roster_change',
      'transfer_issue',
      'etc'
    )
  ),
  constraint campus_requests_status_check check (
    status in ('open', 'in_progress', 'resolved', 'on_hold')
  )
);

alter table campus_requests add column if not exists type text not null default 'etc';
alter table campus_requests add column if not exists status text not null default 'open';
alter table campus_requests add column if not exists title text not null default '';
alter table campus_requests add column if not exists content text not null default '';
alter table campus_requests add column if not exists admin_response text;
alter table campus_requests add column if not exists is_global_notice boolean not null default false;
alter table campus_requests add column if not exists district_id uuid references districts(id);
alter table campus_requests add column if not exists team_id uuid references teams(id);
alter table campus_requests add column if not exists campus_id uuid references campuses(id);
alter table campus_requests add column if not exists district text not null default '';
alter table campus_requests add column if not exists team text not null default '';
alter table campus_requests add column if not exists campus text not null default '';
alter table campus_requests add column if not exists created_by uuid not null default auth.uid();
alter table campus_requests add column if not exists handled_by uuid;
alter table campus_requests add column if not exists handled_at timestamptz;
alter table campus_requests add column if not exists created_at timestamptz not null default now();
alter table campus_requests add column if not exists updated_at timestamptz not null default now();

alter table campus_requests
  drop constraint if exists campus_requests_type_check;

alter table campus_requests
  add constraint campus_requests_type_check
  check (
    type in (
      'late_signup',
      'notice',
      'cancel_refund',
      'payment_issue',
      'roster_change',
      'transfer_issue',
      'etc'
    )
  );

alter table campus_requests
  drop constraint if exists campus_requests_status_check;

alter table campus_requests
  add constraint campus_requests_status_check
  check (status in ('open', 'in_progress', 'resolved', 'on_hold'));

create index if not exists idx_campus_requests_scope_status
  on campus_requests(district, team, campus, status);

create index if not exists idx_campus_requests_scope_ids_status
  on campus_requests(district_id, team_id, campus_id, status);

create index if not exists idx_campus_requests_created_at
  on campus_requests(created_at desc);

create index if not exists idx_campus_requests_global_notice_created_at
  on campus_requests(is_global_notice, created_at desc);

update campus_requests
set
  district_id = coalesce(campus_requests.district_id, campus_options.district_id),
  team_id = coalesce(campus_requests.team_id, campus_options.team_id),
  campus_id = coalesce(campus_requests.campus_id, campus_options.campus_id)
from campus_options
where campus_requests.district = campus_options.district
  and campus_requests.team = campus_options.team
  and campus_requests.campus = campus_options.campus
  and (
    campus_requests.district_id is null
    or campus_requests.team_id is null
    or campus_requests.campus_id is null
  );

create or replace function set_campus_requests_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists set_campus_requests_updated_at on campus_requests;

create trigger set_campus_requests_updated_at
before update on campus_requests
for each row
execute function set_campus_requests_updated_at();

create or replace function set_campus_request_scope_ids()
returns trigger as $$
begin
  if new.district_id is null
    or new.team_id is null
    or new.campus_id is null
  then
    select
      campus_options.district_id,
      campus_options.team_id,
      campus_options.campus_id
    into
      new.district_id,
      new.team_id,
      new.campus_id
    from campus_options
    where campus_options.district = new.district
      and campus_options.team = new.team
      and campus_options.campus = new.campus
    limit 1;
  end if;

  return new;
end;
$$ language plpgsql;

drop trigger if exists set_campus_request_scope_ids on campus_requests;

create trigger set_campus_request_scope_ids
before insert or update on campus_requests
for each row
execute function set_campus_request_scope_ids();

alter table campus_requests enable row level security;

drop policy if exists "Admins can view campus requests" on campus_requests;
drop policy if exists "Campus admins can create campus requests" on campus_requests;
drop policy if exists "Global admins can create campus notices" on campus_requests;
drop policy if exists "Global admins can update campus requests" on campus_requests;

create policy "Admins can view campus requests"
on campus_requests
for select
to authenticated
using (
  exists (
    select 1
    from admin_roles
    where admin_roles.user_id = auth.uid()
      and admin_roles.role = 'global_admin'
  )
  or (
    campus_requests.is_global_notice = true
    and exists (
      select 1
      from admin_roles
      where admin_roles.user_id = auth.uid()
        and admin_roles.role = 'campus_admin'
    )
  )
  or exists (
    select 1
    from admin_roles
    where admin_roles.user_id = auth.uid()
      and admin_roles.role = 'campus_admin'
      and (
        (
          admin_roles.district_id = campus_requests.district_id
          and admin_roles.team_id = campus_requests.team_id
          and admin_roles.campus_id = campus_requests.campus_id
        )
        or (
          admin_roles.district = campus_requests.district
          and admin_roles.team = campus_requests.team
          and admin_roles.campus = campus_requests.campus
        )
      )
  )
);

create policy "Campus admins can create campus requests"
on campus_requests
for insert
to authenticated
with check (
  created_by = auth.uid()
  and campus_requests.is_global_notice = false
  and campus_requests.type <> 'notice'
  and exists (
    select 1
    from admin_roles
    where admin_roles.user_id = auth.uid()
      and admin_roles.role = 'campus_admin'
      and (
        (
          admin_roles.district_id = campus_requests.district_id
          and admin_roles.team_id = campus_requests.team_id
          and admin_roles.campus_id = campus_requests.campus_id
        )
        or (
          admin_roles.district = campus_requests.district
          and admin_roles.team = campus_requests.team
          and admin_roles.campus = campus_requests.campus
        )
      )
  )
);

create policy "Global admins can create campus notices"
on campus_requests
for insert
to authenticated
with check (
  created_by = auth.uid()
  and campus_requests.is_global_notice = true
  and campus_requests.type = 'notice'
  and exists (
    select 1
    from admin_roles
    where admin_roles.user_id = auth.uid()
      and admin_roles.role = 'global_admin'
  )
);

drop function if exists create_global_campus_notice(text, text);

create or replace function create_global_campus_notice(
  p_title text,
  p_content text
)
returns campus_requests
language plpgsql
security definer
set search_path = public
as $$
declare
  v_notice campus_requests;
begin
  if not exists (
    select 1
    from admin_roles
    where admin_roles.user_id = auth.uid()
      and admin_roles.role = 'global_admin'
  ) then
    raise exception 'Only global admins can create campus notices.';
  end if;

  insert into campus_requests (
    type,
    status,
    title,
    content,
    is_global_notice,
    district,
    team,
    campus,
    created_by
  )
  values (
    'notice',
    'open',
    trim(p_title),
    trim(p_content),
    true,
    '전체',
    '전체',
    '전체',
    auth.uid()
  )
  returning * into v_notice;

  return v_notice;
end;
$$;

grant execute on function create_global_campus_notice(text, text) to authenticated;

drop function if exists get_global_campus_notices();

create or replace function get_global_campus_notices()
returns setof campus_requests
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1
    from admin_roles
    where admin_roles.user_id = auth.uid()
      and admin_roles.role in ('global_admin', 'campus_admin')
  ) then
    raise exception 'Only admins can view campus notices.';
  end if;

  return query
  select campus_requests.*
  from campus_requests
  where campus_requests.is_global_notice = true
  order by campus_requests.created_at desc;
end;
$$;

grant execute on function get_global_campus_notices() to authenticated;

notify pgrst, 'reload schema';

create policy "Global admins can update campus requests"
on campus_requests
for update
to authenticated
using (
  exists (
    select 1
    from admin_roles
    where admin_roles.user_id = auth.uid()
      and admin_roles.role = 'global_admin'
  )
)
with check (
  exists (
    select 1
    from admin_roles
    where admin_roles.user_id = auth.uid()
      and admin_roles.role = 'global_admin'
  )
);

create table if not exists campus_request_messages (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references campus_requests(id) on delete cascade,
  sender_id uuid not null default auth.uid(),
  sender_role text not null,
  message text not null,
  created_at timestamptz not null default now(),
  constraint campus_request_messages_sender_role_check check (
    sender_role in ('campus_admin', 'global_admin')
  )
);

alter table campus_request_messages
  add column if not exists request_id uuid references campus_requests(id) on delete cascade;
alter table campus_request_messages
  add column if not exists sender_id uuid not null default auth.uid();
alter table campus_request_messages
  add column if not exists sender_role text not null default 'campus_admin';
alter table campus_request_messages
  add column if not exists message text not null default '';
alter table campus_request_messages
  add column if not exists created_at timestamptz not null default now();

alter table campus_request_messages
  drop constraint if exists campus_request_messages_sender_role_check;

alter table campus_request_messages
  add constraint campus_request_messages_sender_role_check
  check (sender_role in ('campus_admin', 'global_admin'));

create index if not exists idx_campus_request_messages_request_created
  on campus_request_messages(request_id, created_at);

alter table campus_request_messages enable row level security;

drop policy if exists "Admins can view campus request messages" on campus_request_messages;
drop policy if exists "Admins can create campus request messages" on campus_request_messages;
drop policy if exists "Admins can update own campus request messages" on campus_request_messages;
drop policy if exists "Admins can delete own campus request messages" on campus_request_messages;

create policy "Admins can view campus request messages"
on campus_request_messages
for select
to authenticated
using (
  exists (
    select 1
    from admin_roles
    where admin_roles.user_id = auth.uid()
      and admin_roles.role = 'global_admin'
  )
  or exists (
    select 1
    from campus_requests
    join admin_roles on admin_roles.user_id = auth.uid()
    where campus_requests.id = campus_request_messages.request_id
      and campus_requests.is_global_notice = true
      and admin_roles.role = 'campus_admin'
  )
  or exists (
    select 1
    from campus_requests
    join admin_roles on admin_roles.user_id = auth.uid()
    where campus_requests.id = campus_request_messages.request_id
      and admin_roles.role = 'campus_admin'
      and (
        (
          admin_roles.district_id = campus_requests.district_id
          and admin_roles.team_id = campus_requests.team_id
          and admin_roles.campus_id = campus_requests.campus_id
        )
        or (
          admin_roles.district = campus_requests.district
          and admin_roles.team = campus_requests.team
          and admin_roles.campus = campus_requests.campus
        )
      )
  )
);

create policy "Admins can create campus request messages"
on campus_request_messages
for insert
to authenticated
with check (
  sender_id = auth.uid()
  and (
    exists (
      select 1
      from admin_roles
      where admin_roles.user_id = auth.uid()
        and admin_roles.role = 'global_admin'
        and campus_request_messages.sender_role = 'global_admin'
    )
    or exists (
      select 1
      from campus_requests
      join admin_roles on admin_roles.user_id = auth.uid()
      where campus_requests.id = campus_request_messages.request_id
        and admin_roles.role = 'campus_admin'
        and (
          (
            admin_roles.district_id = campus_requests.district_id
            and admin_roles.team_id = campus_requests.team_id
            and admin_roles.campus_id = campus_requests.campus_id
          )
          or (
            admin_roles.district = campus_requests.district
            and admin_roles.team = campus_requests.team
            and admin_roles.campus = campus_requests.campus
          )
        )
        and campus_request_messages.sender_role = 'campus_admin'
    )
  )
);

create policy "Admins can update own campus request messages"
on campus_request_messages
for update
to authenticated
using (
  exists (
    select 1
    from admin_roles
    where admin_roles.user_id = auth.uid()
      and admin_roles.role = 'global_admin'
  )
  or (
    sender_id = auth.uid()
    and exists (
      select 1
      from campus_requests
      join admin_roles on admin_roles.user_id = auth.uid()
      where campus_requests.id = campus_request_messages.request_id
        and admin_roles.role = 'campus_admin'
        and (
          (
            admin_roles.district_id = campus_requests.district_id
            and admin_roles.team_id = campus_requests.team_id
            and admin_roles.campus_id = campus_requests.campus_id
          )
          or (
            admin_roles.district = campus_requests.district
            and admin_roles.team = campus_requests.team
            and admin_roles.campus = campus_requests.campus
          )
        )
        and campus_request_messages.sender_role = 'campus_admin'
    )
  )
)
with check (
  exists (
    select 1
    from admin_roles
    where admin_roles.user_id = auth.uid()
      and admin_roles.role = 'global_admin'
  )
  or (
    sender_id = auth.uid()
    and exists (
      select 1
      from campus_requests
      join admin_roles on admin_roles.user_id = auth.uid()
      where campus_requests.id = campus_request_messages.request_id
        and admin_roles.role = 'campus_admin'
        and (
          (
            admin_roles.district_id = campus_requests.district_id
            and admin_roles.team_id = campus_requests.team_id
            and admin_roles.campus_id = campus_requests.campus_id
          )
          or (
            admin_roles.district = campus_requests.district
            and admin_roles.team = campus_requests.team
            and admin_roles.campus = campus_requests.campus
          )
        )
        and campus_request_messages.sender_role = 'campus_admin'
    )
  )
);

create policy "Admins can delete own campus request messages"
on campus_request_messages
for delete
to authenticated
using (
  exists (
    select 1
    from admin_roles
    where admin_roles.user_id = auth.uid()
      and admin_roles.role = 'global_admin'
  )
  or (
    sender_id = auth.uid()
    and exists (
      select 1
      from campus_requests
      join admin_roles on admin_roles.user_id = auth.uid()
      where campus_requests.id = campus_request_messages.request_id
        and admin_roles.role = 'campus_admin'
        and (
          (
            admin_roles.district_id = campus_requests.district_id
            and admin_roles.team_id = campus_requests.team_id
            and admin_roles.campus_id = campus_requests.campus_id
          )
          or (
            admin_roles.district = campus_requests.district
            and admin_roles.team = campus_requests.team
            and admin_roles.campus = campus_requests.campus
          )
        )
        and campus_request_messages.sender_role = 'campus_admin'
    )
  )
);
