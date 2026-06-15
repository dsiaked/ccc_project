-- Keep individual payment records consistent with server pricing and campus
-- transfer snapshots.

create or replace function public.get_payment_scope_lock_key(
  p_campus_id uuid,
  p_district text,
  p_team text,
  p_campus text
)
returns bigint
language sql
immutable
set search_path = public
as $$
  select hashtextextended(
    'campus-payment:' || coalesce(
      p_campus_id::text,
      coalesce(p_district, '') || '|' || coalesce(p_team, '') || '|' || coalesce(p_campus, '')
    ),
    0
  );
$$;

create or replace function public.enforce_payment_mutation_financial_safety()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reservation public.reservations;
  v_financial_change boolean := tg_op = 'INSERT';
begin
  select *
  into v_reservation
  from public.reservations
  where id = new.reservation_id;

  if v_reservation.id is null then
    return new;
  end if;

  perform pg_advisory_xact_lock(public.get_payment_scope_lock_key(
    v_reservation.campus_id,
    v_reservation.district,
    v_reservation.team,
    v_reservation.campus
  ));

  if tg_op = 'UPDATE' then
    v_financial_change :=
      old.amount is distinct from new.amount
      or old.status is distinct from new.status;
  end if;

  if not coalesce(v_reservation.data ? 'remainingSeatClaim', false)
    and v_financial_change
    and exists (
      select 1
      from public.campus_transfers transfer
      where transfer.status in ('sent', 'confirmed')
        and (
          (
            v_reservation.campus_id is not null
            and transfer.campus_id = v_reservation.campus_id
          )
          or (
            transfer.district = v_reservation.district
            and transfer.team = v_reservation.team
            and transfer.campus = v_reservation.campus
          )
        )
    ) then
    raise exception 'Cancel or reopen the campus transfer before changing individual payments.';
  end if;

  return new;
end;
$$;

drop trigger if exists enforce_payment_mutation_financial_safety
on public.payments;

create trigger enforce_payment_mutation_financial_safety
before insert or update on public.payments
for each row
execute function public.enforce_payment_mutation_financial_safety();

create or replace function public.validate_campus_transfer_financial_snapshot()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_total_people integer;
  v_paid_people integer;
  v_total_amount integer;
  v_snapshot_change boolean := tg_op = 'INSERT';
begin
  if tg_op = 'UPDATE' then
    v_snapshot_change :=
      old.status is distinct from new.status
      or old.total_people is distinct from new.total_people
      or old.paid_people is distinct from new.paid_people
      or old.total_amount is distinct from new.total_amount;
  end if;

  if not v_snapshot_change then
    return new;
  end if;

  perform pg_advisory_xact_lock(public.get_payment_scope_lock_key(
    new.campus_id,
    new.district,
    new.team,
    new.campus
  ));

  if new.status in ('sent', 'confirmed') then
    select
      count(*)::integer,
      count(*) filter (
        where exists (
          select 1
          from public.payments payment
          where payment.reservation_id = reservation.id
            and payment.status = 'completed'
        )
      )::integer
    into v_total_people, v_paid_people
    from public.reservations reservation
    where reservation.status is distinct from 'cancelled'
      and (
        (
          new.campus_id is not null
          and reservation.campus_id = new.campus_id
        )
        or (
          reservation.district = new.district
          and reservation.team = new.team
          and reservation.campus = new.campus
        )
      );

    v_total_amount := v_total_people * public.get_bus_ticket_price();

    if new.total_people is distinct from v_total_people
      or new.paid_people is distinct from v_paid_people
      or new.total_amount is distinct from v_total_amount then
      raise exception 'Campus transfer totals changed. Refresh and try again.';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists validate_campus_transfer_financial_snapshot
on public.campus_transfers;

create trigger validate_campus_transfer_financial_snapshot
before insert or update on public.campus_transfers
for each row
execute function public.validate_campus_transfer_financial_snapshot();

create or replace function public.upsert_reservation_payment(
  p_payment_id uuid,
  p_reservation_id uuid,
  p_user_id uuid,
  p_amount integer,
  p_status text
)
returns public.payments
language plpgsql
security definer
set search_path = public
as $$
declare
  v_payment public.payments;
  v_reservation public.reservations;
  v_expected_amount integer;
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
  where id = p_reservation_id
  for update;

  if v_reservation.id is null then
    raise exception 'Reservation not found.';
  end if;

  if p_user_id is distinct from v_reservation.user_id then
    raise exception 'Payment user does not match the reservation owner.';
  end if;

  if v_reservation.data ? 'remainingSeatClaim' then
    raise exception 'Remaining seat payments must use the dedicated confirmation workflow.';
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

  if exists (
    select 1
    from public.campus_transfers transfer
    where transfer.status in ('sent', 'confirmed')
      and (
        (
          v_reservation.campus_id is not null
          and transfer.campus_id = v_reservation.campus_id
        )
        or (
          transfer.district = v_reservation.district
          and transfer.team = v_reservation.team
          and transfer.campus = v_reservation.campus
        )
      )
  ) then
    raise exception 'Cancel or reopen the campus transfer before changing individual payments.';
  end if;

  v_expected_amount := greatest(public.get_bus_ticket_price(), 0);

  if v_expected_amount <= 0 then
    raise exception 'A positive bus ticket price is required before changing payments.';
  end if;

  if p_amount is distinct from v_expected_amount then
    raise exception 'Payment amount changed. Refresh and try again.';
  end if;

  if p_payment_id is not null then
    update public.payments
    set
      amount = v_expected_amount,
      status = p_status,
      paid_at = case
        when p_status = 'completed' then coalesce(paid_at, clock_timestamp())
        else paid_at
      end,
      verified_by = case
        when p_status = 'completed' then auth.uid()
        else null
      end,
      verified_at = case
        when p_status = 'completed' then clock_timestamp()
        else null
      end,
      updated_at = clock_timestamp()
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
    paid_at,
    verified_by,
    verified_at,
    updated_at
  )
  values (
    v_reservation.user_id,
    p_reservation_id,
    v_expected_amount,
    p_status,
    case when p_status = 'completed' then clock_timestamp() else null end,
    case when p_status = 'completed' then auth.uid() else null end,
    case when p_status = 'completed' then clock_timestamp() else null end,
    clock_timestamp()
  )
  on conflict (reservation_id)
  where reservation_id is not null
  do update set
    amount = excluded.amount,
    status = excluded.status,
    paid_at = case
      when excluded.status = 'completed' then coalesce(payments.paid_at, excluded.paid_at)
      else payments.paid_at
    end,
    verified_by = excluded.verified_by,
    verified_at = excluded.verified_at,
    updated_at = excluded.updated_at
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

notify pgrst, 'reload schema';
