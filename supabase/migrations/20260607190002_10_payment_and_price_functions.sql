-- ===== sql/setup/10_payment_and_price_functions.sql =====

-- =========================================================
-- Payment upsert and bus ticket price functions
-- Run after 05_app_settings.sql.
--
-- Functions used by src/lib/adminService.ts:
-- - upsert_reservation_payment
-- - get_bus_ticket_price
-- - update_bus_ticket_price
-- =========================================================

create extension if not exists "pgcrypto";

insert into app_settings (key, value)
values ('bus_ticket_price', '{"price": 0}'::jsonb)
on conflict (key) do nothing;

-- Payment rows are created and changed only through the authorized RPC below.
drop policy if exists "Users can insert own payments" on public.payments;
drop policy if exists "Campus admins can update campus payments" on public.payments;
drop policy if exists "Global admins can update all payments" on public.payments;

revoke insert, update, delete on table public.payments from public, anon, authenticated;

create or replace function public.upsert_reservation_payment(
  p_payment_id uuid,
  p_reservation_id uuid,
  p_user_id uuid,
  p_amount integer,
  p_status text
)
returns payments
language plpgsql
security definer
set search_path = public
as $$
declare
  v_payment payments;
  v_reservation reservations;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required.';
  end if;

  if p_status not in ('pending', 'completed', 'refunded') then
    raise exception 'Invalid payment status: %', p_status;
  end if;

  select *
  into v_reservation
  from public.reservations
  where id = p_reservation_id;

  if v_reservation.id is null then
    raise exception 'Reservation not found.';
  end if;

  if p_user_id is distinct from v_reservation.user_id then
    raise exception 'Payment user does not match the reservation owner.';
  end if;

  if not exists (
    select 1
    from public.admin_roles
    where admin_roles.user_id = auth.uid()
      and (
        admin_roles.role = 'global_admin'
        or (
          admin_roles.role = 'campus_admin'
          and (
            (
              admin_roles.district_id = v_reservation.district_id
              and admin_roles.team_id = v_reservation.team_id
              and admin_roles.campus_id = v_reservation.campus_id
            )
            or (
              admin_roles.district = v_reservation.district
              and admin_roles.team = v_reservation.team
              and admin_roles.campus = v_reservation.campus
            )
          )
        )
      )
  ) then
    raise exception 'Not authorized to manage this reservation payment.';
  end if;

  if p_payment_id is not null then
    update public.payments
    set
      amount = greatest(coalesce(p_amount, 0), 0),
      status = p_status,
      verified_by = case
        when p_status = 'completed' then auth.uid()
        else null
      end,
      verified_at = case
        when p_status = 'completed' then now()
        else null
      end,
      updated_at = now()
    where id = p_payment_id
      and reservation_id = p_reservation_id
      and user_id = v_reservation.user_id
    returning * into v_payment;

    if v_payment.id is not null then
      return v_payment;
    end if;

    raise exception 'Payment does not match the selected reservation.';
  end if;

  insert into public.payments (
    user_id,
    reservation_id,
    amount,
    status,
    verified_by,
    verified_at,
    updated_at
  )
  values (
    v_reservation.user_id,
    p_reservation_id,
    greatest(coalesce(p_amount, 0), 0),
    p_status,
    case when p_status = 'completed' then auth.uid() else null end,
    case when p_status = 'completed' then now() else null end,
    now()
  )
  on conflict (reservation_id)
  where reservation_id is not null
  do update set
    amount = excluded.amount,
    status = excluded.status,
    verified_by = excluded.verified_by,
    verified_at = excluded.verified_at,
    updated_at = now()
  returning * into v_payment;

  return v_payment;
end;
$$;

revoke all on function public.upsert_reservation_payment(
  uuid, uuid, uuid, integer, text
) from public, anon;
grant execute on function public.upsert_reservation_payment(
  uuid, uuid, uuid, integer, text
) to authenticated;

create or replace function get_bus_ticket_price()
returns integer
language sql
security definer
set search_path = public
as $$
  select coalesce(
    (
      select (value ->> 'price')::integer
      from app_settings
      where key = 'bus_ticket_price'
    ),
    0
  );
$$;

create or replace function update_bus_ticket_price(p_price integer)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_price integer := greatest(coalesce(p_price, 0), 0);
begin
  if not exists (
    select 1
    from admin_roles
    where admin_roles.user_id = auth.uid()
      and admin_roles.role = 'global_admin'
  ) then
    raise exception 'Only global admins can update bus ticket price.';
  end if;

  insert into app_settings (key, value, updated_at)
  values ('bus_ticket_price', jsonb_build_object('price', v_price), now())
  on conflict (key)
  do update set
    value = excluded.value,
    updated_at = now();

  return v_price;
end;
$$;



-- ===== sql/setup/30_campus_transfer_settlement.sql =====

-- =========================================================
-- Campus transfer additional settlement support
-- Run this in Supabase SQL Editor.
--
-- Purpose:
-- - Keep campus_transfers as the reported snapshot.
-- - Return current reservation/payment totals separately.
-- - Mark rows as "additional settlement needed" when current totals exceed
--   the reported snapshot after a campus already reported a transfer.
-- =========================================================

create table if not exists campus_transfers (
  id uuid primary key default gen_random_uuid(),
  district_id uuid references districts(id),
  team_id uuid references teams(id),
  campus_id uuid references campuses(id),
  district text not null,
  team text not null,
  campus text not null,
  total_people integer not null default 0,
  paid_people integer not null default 0,
  total_amount integer not null default 0,
  status text not null default 'sent'
    check (status in ('sent', 'confirmed')),
  sent_by uuid references auth.users(id),
  sent_at timestamptz not null default now(),
  confirmed_by uuid references auth.users(id),
  confirmed_at timestamptz,
  actual_confirmed_amount integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table campus_transfers add column if not exists district_id uuid references districts(id);
alter table campus_transfers add column if not exists team_id uuid references teams(id);
alter table campus_transfers add column if not exists campus_id uuid references campuses(id);
alter table campus_transfers add column if not exists district text;
alter table campus_transfers add column if not exists team text;
alter table campus_transfers add column if not exists campus text;
alter table campus_transfers
  add column if not exists total_people integer not null default 0;
alter table campus_transfers
  add column if not exists paid_people integer not null default 0;
alter table campus_transfers
  add column if not exists total_amount integer not null default 0;
alter table campus_transfers add column if not exists status text not null default 'sent';

alter table campus_transfers
  drop constraint if exists campus_transfers_status_check;

alter table campus_transfers
  add constraint campus_transfers_status_check
  check (status in ('sent', 'confirmed'));

alter table campus_transfers add column if not exists sent_by uuid references auth.users(id);
alter table campus_transfers
  add column if not exists sent_at timestamptz not null default now();
alter table campus_transfers
  add column if not exists confirmed_by uuid references auth.users(id);
alter table campus_transfers add column if not exists confirmed_at timestamptz;
alter table campus_transfers add column if not exists actual_confirmed_amount integer;
alter table campus_transfers
  add column if not exists created_at timestamptz not null default now();
alter table campus_transfers
  add column if not exists updated_at timestamptz not null default now();

create unique index if not exists idx_campus_transfers_campus_unique
  on campus_transfers(district, team, campus);

create index if not exists idx_campus_transfers_scope_ids
  on campus_transfers(district_id, team_id, campus_id);

alter table campus_transfers enable row level security;

drop policy if exists "Admins can view campus transfers" on campus_transfers;
create policy "Admins can view campus transfers"
on campus_transfers
for select
using (
  exists (
    select 1
    from admin_roles
    where admin_roles.user_id = auth.uid()
      and (
        admin_roles.role = 'global_admin'
        or (
          admin_roles.role = 'campus_admin'
          and admin_roles.district = campus_transfers.district
          and admin_roles.team = campus_transfers.team
          and admin_roles.campus = campus_transfers.campus
        )
      )
  )
);

drop policy if exists "Global admins can update campus transfers" on campus_transfers;
revoke insert, update, delete on table public.campus_transfers from public, anon, authenticated;

update campus_transfers
set
  district_id = coalesce(campus_transfers.district_id, campus_options.district_id),
  team_id = coalesce(campus_transfers.team_id, campus_options.team_id),
  campus_id = coalesce(campus_transfers.campus_id, campus_options.campus_id)
from campus_options
where campus_transfers.district = campus_options.district
  and campus_transfers.team = campus_options.team
  and campus_transfers.campus = campus_options.campus
  and (
    campus_transfers.district_id is null
    or campus_transfers.team_id is null
    or campus_transfers.campus_id is null
  );

create or replace function set_campus_transfer_scope_ids()
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

drop trigger if exists set_campus_transfer_scope_ids on campus_transfers;

create trigger set_campus_transfer_scope_ids
before insert or update on campus_transfers
for each row
execute function set_campus_transfer_scope_ids();

create or replace function mark_campus_transfer_sent(
  p_district text,
  p_team text,
  p_campus text,
  p_total_people integer,
  p_paid_people integer,
  p_total_amount integer,
  p_sent_by uuid
)
returns campus_transfers
language plpgsql
security definer
set search_path = public
as $$
declare
  v_transfer campus_transfers;
begin
  if auth.uid() is null or not exists (
    select 1
    from admin_roles
    where admin_roles.user_id = auth.uid()
      and (
        admin_roles.role = 'global_admin'
        or (
          admin_roles.role = 'campus_admin'
          and admin_roles.district = p_district
          and admin_roles.team = p_team
          and admin_roles.campus = p_campus
        )
      )
  ) then
    raise exception 'Not authorized to report this campus transfer.';
  end if;

  insert into campus_transfers (
    district_id,
    team_id,
    campus_id,
    district,
    team,
    campus,
    total_people,
    paid_people,
    total_amount,
    status,
    sent_by,
    sent_at,
    confirmed_by,
    confirmed_at,
    actual_confirmed_amount,
    updated_at
  )
  values (
    (
      select campus_options.district_id
      from campus_options
      where campus_options.district = p_district
        and campus_options.team = p_team
        and campus_options.campus = p_campus
      limit 1
    ),
    (
      select campus_options.team_id
      from campus_options
      where campus_options.district = p_district
        and campus_options.team = p_team
        and campus_options.campus = p_campus
      limit 1
    ),
    (
      select campus_options.campus_id
      from campus_options
      where campus_options.district = p_district
        and campus_options.team = p_team
        and campus_options.campus = p_campus
      limit 1
    ),
    p_district,
    p_team,
    p_campus,
    p_total_people,
    p_paid_people,
    p_total_amount,
    'sent',
    auth.uid(),
    now(),
    null,
    null,
    null,
    now()
  )
  on conflict (district, team, campus)
  do update set
    district_id = excluded.district_id,
    team_id = excluded.team_id,
    campus_id = excluded.campus_id,
    total_people = excluded.total_people,
    paid_people = excluded.paid_people,
    total_amount = excluded.total_amount,
    status = 'sent',
    sent_by = excluded.sent_by,
    sent_at = now(),
    confirmed_by = null,
    confirmed_at = null,
    actual_confirmed_amount = null,
    updated_at = now()
  returning * into v_transfer;

  return v_transfer;
end;
$$;

drop function if exists get_global_campus_transfer_stats();

create function get_global_campus_transfer_stats()
returns table (
  id uuid,
  district text,
  team text,
  campus text,
  campus_admin_name text,
  campus_admin_phone text,
  current_total_people integer,
  current_paid_people integer,
  current_total_amount integer,
  reported_total_people integer,
  reported_paid_people integer,
  reported_total_amount integer,
  actual_confirmed_amount integer,
  additional_amount_due integer,
  has_additional_settlement boolean,
  status text,
  sent_at timestamptz
)
language sql
security definer
set search_path = public
as $$
  with active_campuses as (
    select distinct
      campus_options.district,
      campus_options.team,
      campus_options.campus
    from campus_options
  ),
  current_stats as (
    select
      reservations.district,
      reservations.team,
      reservations.campus,
      count(reservations.id)::integer as current_total_people,
      count(payments.id) filter (where payments.status = 'completed')::integer
        as current_paid_people,
      (
        count(reservations.id) * get_bus_ticket_price()
      )::integer as current_total_amount
    from reservations
    left join payments on payments.reservation_id = reservations.id
    where coalesce(reservations.status, 'requested') <> 'cancelled'
    group by reservations.district, reservations.team, reservations.campus
  ),
  campus_admins as (
    select distinct on (admin_roles.district, admin_roles.team, admin_roles.campus)
      admin_roles.district,
      admin_roles.team,
      admin_roles.campus,
      profiles.name as campus_admin_name,
      profiles.phone as campus_admin_phone
    from admin_roles
    left join profiles on profiles.id = admin_roles.user_id
    where admin_roles.role = 'campus_admin'
    order by
      admin_roles.district,
      admin_roles.team,
      admin_roles.campus,
      admin_roles.updated_at desc nulls last,
      admin_roles.created_at desc nulls last
  )
  select
    campus_transfers.id,
    active_campuses.district,
    active_campuses.team,
    active_campuses.campus,
    campus_admins.campus_admin_name,
    campus_admins.campus_admin_phone,
    coalesce(current_stats.current_total_people, 0) as current_total_people,
    coalesce(current_stats.current_paid_people, 0) as current_paid_people,
    coalesce(current_stats.current_total_amount, 0) as current_total_amount,
    coalesce(campus_transfers.total_people, 0) as reported_total_people,
    coalesce(campus_transfers.paid_people, 0) as reported_paid_people,
    coalesce(campus_transfers.total_amount, 0) as reported_total_amount,
    campus_transfers.actual_confirmed_amount,
    greatest(
      coalesce(current_stats.current_total_amount, 0)
        - coalesce(campus_transfers.total_amount, 0),
      0
    )::integer as additional_amount_due,
    (
      campus_transfers.id is not null
      and campus_transfers.status in ('sent', 'confirmed')
      and (
        coalesce(current_stats.current_total_people, 0)
          > coalesce(campus_transfers.total_people, 0)
        or coalesce(current_stats.current_paid_people, 0)
          > coalesce(campus_transfers.paid_people, 0)
        or coalesce(current_stats.current_total_amount, 0)
          > coalesce(campus_transfers.total_amount, 0)
      )
    ) as has_additional_settlement,
    coalesce(campus_transfers.status, 'pending') as status,
    campus_transfers.sent_at
  from active_campuses
  left join current_stats
    on current_stats.district = active_campuses.district
   and current_stats.team = active_campuses.team
   and current_stats.campus = active_campuses.campus
  left join campus_transfers
    on campus_transfers.district = active_campuses.district
   and campus_transfers.team = active_campuses.team
   and campus_transfers.campus = active_campuses.campus
  left join campus_admins
    on campus_admins.district = active_campuses.district
   and campus_admins.team = active_campuses.team
   and campus_admins.campus = active_campuses.campus
  where exists (
    select 1
    from admin_roles
    where admin_roles.user_id = auth.uid()
      and admin_roles.role = 'global_admin'
  )
  order by active_campuses.district, active_campuses.team, active_campuses.campus;
$$;

revoke execute on function mark_campus_transfer_sent(
  text, text, text, integer, integer, integer, uuid
) from public, anon;
grant execute on function mark_campus_transfer_sent(
  text, text, text, integer, integer, integer, uuid
) to authenticated;

revoke execute on function get_global_campus_transfer_stats() from public, anon;
grant execute on function get_global_campus_transfer_stats() to authenticated;



-- ===== sql/setup/33_confirm_campus_transfer_amount.sql =====

-- Confirm campus transfer amount through a security definer RPC.
-- Run this in Supabase SQL Editor after the base campus transfer setup.

create or replace function confirm_campus_transfer_amount(
  p_transfer_id uuid,
  p_confirmed_by uuid,
  p_actual_confirmed_amount integer
)
returns campus_transfers
language plpgsql
security definer
set search_path = public
as $$
declare
  v_transfer campus_transfers;
begin
  if auth.uid() is null or not exists (
    select 1
    from admin_roles
    where admin_roles.user_id = auth.uid()
      and admin_roles.role = 'global_admin'
  ) then
    raise exception 'Only global admins can confirm campus transfers.';
  end if;

  update campus_transfers
  set
    status = 'confirmed',
    confirmed_by = auth.uid(),
    confirmed_at = now(),
    actual_confirmed_amount = greatest(
      coalesce(p_actual_confirmed_amount, 0),
      0
    ),
    updated_at = now()
  where id = p_transfer_id
  returning * into v_transfer;

  if v_transfer.id is null then
    raise exception 'campus transfer not found: %', p_transfer_id;
  end if;

  return v_transfer;
end;
$$;

revoke execute on function confirm_campus_transfer_amount(uuid, uuid, integer)
from public, anon;
grant execute on function confirm_campus_transfer_amount(uuid, uuid, integer)
to authenticated;

-- Ask Supabase/PostgREST to refresh its schema cache immediately.
notify pgrst, 'reload schema';



-- ===== sql/setup/34_fix_campus_transfer_expected_amount.sql =====

-- Calculate the current transfer expected amount from all active reservations,
-- including reservations whose payments have not been confirmed yet.

create or replace function get_global_campus_transfer_stats()
returns table (
  id uuid,
  district text,
  team text,
  campus text,
  campus_admin_name text,
  campus_admin_phone text,
  current_total_people integer,
  current_paid_people integer,
  current_total_amount integer,
  reported_total_people integer,
  reported_paid_people integer,
  reported_total_amount integer,
  actual_confirmed_amount integer,
  additional_amount_due integer,
  has_additional_settlement boolean,
  status text,
  sent_at timestamptz
)
language sql
security definer
set search_path = public
as $$
  with active_campuses as (
    select distinct
      campus_options.district,
      campus_options.team,
      campus_options.campus
    from campus_options
  ),
  current_stats as (
    select
      reservations.district,
      reservations.team,
      reservations.campus,
      count(reservations.id)::integer as current_total_people,
      count(payments.id) filter (where payments.status = 'completed')::integer
        as current_paid_people,
      (
        count(reservations.id) * get_bus_ticket_price()
      )::integer as current_total_amount
    from reservations
    left join payments on payments.reservation_id = reservations.id
    where coalesce(reservations.status, 'requested') <> 'cancelled'
    group by reservations.district, reservations.team, reservations.campus
  ),
  campus_admins as (
    select distinct on (admin_roles.district, admin_roles.team, admin_roles.campus)
      admin_roles.district,
      admin_roles.team,
      admin_roles.campus,
      profiles.name as campus_admin_name,
      profiles.phone as campus_admin_phone
    from admin_roles
    left join profiles on profiles.id = admin_roles.user_id
    where admin_roles.role = 'campus_admin'
    order by
      admin_roles.district,
      admin_roles.team,
      admin_roles.campus,
      admin_roles.updated_at desc nulls last,
      admin_roles.created_at desc nulls last
  )
  select
    campus_transfers.id,
    active_campuses.district,
    active_campuses.team,
    active_campuses.campus,
    campus_admins.campus_admin_name,
    campus_admins.campus_admin_phone,
    coalesce(current_stats.current_total_people, 0) as current_total_people,
    coalesce(current_stats.current_paid_people, 0) as current_paid_people,
    coalesce(current_stats.current_total_amount, 0) as current_total_amount,
    coalesce(campus_transfers.total_people, 0) as reported_total_people,
    coalesce(campus_transfers.paid_people, 0) as reported_paid_people,
    coalesce(campus_transfers.total_amount, 0) as reported_total_amount,
    campus_transfers.actual_confirmed_amount,
    greatest(
      coalesce(current_stats.current_total_amount, 0)
        - coalesce(campus_transfers.total_amount, 0),
      0
    )::integer as additional_amount_due,
    (
      campus_transfers.id is not null
      and campus_transfers.status in ('sent', 'confirmed')
      and (
        coalesce(current_stats.current_total_people, 0)
          > coalesce(campus_transfers.total_people, 0)
        or coalesce(current_stats.current_paid_people, 0)
          > coalesce(campus_transfers.paid_people, 0)
        or coalesce(current_stats.current_total_amount, 0)
          > coalesce(campus_transfers.total_amount, 0)
      )
    ) as has_additional_settlement,
    coalesce(campus_transfers.status, 'pending') as status,
    campus_transfers.sent_at
  from active_campuses
  left join current_stats
    on current_stats.district = active_campuses.district
   and current_stats.team = active_campuses.team
   and current_stats.campus = active_campuses.campus
  left join campus_transfers
    on campus_transfers.district = active_campuses.district
   and campus_transfers.team = active_campuses.team
   and campus_transfers.campus = active_campuses.campus
  left join campus_admins
    on campus_admins.district = active_campuses.district
   and campus_admins.team = active_campuses.team
   and campus_admins.campus = active_campuses.campus
  where exists (
    select 1
    from admin_roles
    where admin_roles.user_id = auth.uid()
      and admin_roles.role = 'global_admin'
  )
  order by active_campuses.district, active_campuses.team, active_campuses.campus;
$$;

revoke execute on function get_global_campus_transfer_stats() from public, anon;
grant execute on function get_global_campus_transfer_stats() to authenticated;

notify pgrst, 'reload schema';



