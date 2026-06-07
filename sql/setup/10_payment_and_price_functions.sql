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
