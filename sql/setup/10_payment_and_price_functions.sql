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

create or replace function upsert_reservation_payment(
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
begin
  if p_status not in ('pending', 'completed', 'refunded') then
    raise exception 'Invalid payment status: %', p_status;
  end if;

  if p_payment_id is not null then
    update payments
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
    returning * into v_payment;

    if v_payment.id is not null then
      return v_payment;
    end if;
  end if;

  insert into payments (
    user_id,
    reservation_id,
    amount,
    status,
    verified_by,
    verified_at,
    updated_at
  )
  values (
    p_user_id,
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
