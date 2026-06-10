-- Remove the refund workflow and keep cancellation/payment transitions simple.

update public.payments
set
  status = 'completed',
  paid_at = coalesce(paid_at, clock_timestamp()),
  updated_at = clock_timestamp()
where status in ('refund_required', 'refunded');

alter table public.payments drop constraint if exists payments_status_check;
alter table public.payments
  add constraint payments_status_check
  check (status in ('pending', 'completed'));

update public.campus_requests
set type = 'etc', updated_at = clock_timestamp()
where type = 'cancel_refund';

alter table public.campus_requests drop constraint if exists campus_requests_type_check;
alter table public.campus_requests
  add constraint campus_requests_type_check
  check (
    type in (
      'late_signup',
      'notice',
      'payment_issue',
      'roster_change',
      'transfer_issue',
      'etc'
    )
  );

create or replace function public.manage_personal_reservation_status(
  p_reservation_id uuid,
  p_next_status text,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_before public.reservations%rowtype;
  v_payment public.payments%rowtype;
begin
  if not public.is_global_admin() then
    raise exception 'Only global admins can manage personal reservations.';
  end if;
  if p_next_status not in ('requested', 'cancelled') then
    raise exception 'Invalid reservation status.';
  end if;
  if nullif(btrim(p_reason), '') is null then raise exception 'A reason is required.'; end if;

  select * into v_before from public.reservations where id = p_reservation_id for update;
  if not found then raise exception 'Reservation not found.'; end if;
  select * into v_payment from public.payments where reservation_id = p_reservation_id for update;

  perform public.update_personal_ticket_as_admin(p_reservation_id, p_next_status, null);

  if p_next_status = 'cancelled' and v_payment.id is not null then
    update public.payments
    set
      status = 'pending',
      paid_at = null,
      verified_by = null,
      verified_at = null,
      notes = btrim(p_reason),
      updated_at = clock_timestamp()
    where id = v_payment.id;
  end if;

  insert into public.personal_user_action_logs (
    target_user_id, reservation_id, actor_id, action, reason,
    before_data, after_data, reversible
  )
  select
    v_before.user_id, v_before.id, auth.uid(),
    case when p_next_status = 'cancelled' then 'reservation_cancelled' else 'reservation_restored' end,
    btrim(p_reason),
    jsonb_build_object(
      'reservationStatus', v_before.status,
      'confirmedTicket', v_before.confirmed_ticket,
      'paymentStatus', v_payment.status
    ),
    jsonb_build_object(
      'reservationStatus', reservation.status,
      'confirmedTicket', reservation.confirmed_ticket,
      'paymentStatus', (select status from public.payments where reservation_id = reservation.id)
    ),
    false
  from public.reservations reservation where reservation.id = p_reservation_id;
end;
$$;

create or replace function public.manage_personal_user_payment(
  p_reservation_id uuid,
  p_status text,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reservation public.reservations%rowtype;
  v_before_status text;
begin
  if not public.is_global_admin() then raise exception 'Only global admins can manage personal payments.'; end if;
  if p_status not in ('pending', 'completed') then raise exception 'Invalid payment status.'; end if;
  if nullif(btrim(p_reason), '') is null then raise exception 'A reason is required.'; end if;

  select * into v_reservation from public.reservations where id = p_reservation_id for update;
  if not found then raise exception 'Reservation not found.'; end if;
  select status into v_before_status from public.payments where reservation_id = p_reservation_id for update;

  insert into public.payments (user_id, reservation_id, amount, status, paid_at, verified_by, verified_at, notes)
  values (
    v_reservation.user_id, v_reservation.id, 0, p_status,
    case when p_status = 'completed' then clock_timestamp() end,
    case when p_status = 'completed' then auth.uid() end,
    case when p_status = 'completed' then clock_timestamp() end,
    btrim(p_reason)
  )
  on conflict (reservation_id) where reservation_id is not null do update set
    status = excluded.status,
    paid_at = excluded.paid_at,
    verified_by = excluded.verified_by,
    verified_at = excluded.verified_at,
    notes = excluded.notes,
    updated_at = clock_timestamp();

  insert into public.personal_user_action_logs (
    target_user_id, reservation_id, actor_id, action, reason,
    before_data, after_data, reversible
  ) values (
    v_reservation.user_id, v_reservation.id, auth.uid(), 'payment_' || p_status, btrim(p_reason),
    jsonb_build_object('paymentStatus', v_before_status),
    jsonb_build_object('paymentStatus', p_status),
    true
  );
end;
$$;

create or replace function public.cancel_remaining_seat_claim(p_reservation_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id uuid := auth.uid();
  v_reservation public.reservations;
  v_claim jsonb;
  v_allocation_data jsonb;
  v_is_global_admin boolean;
  v_payment_status text;
begin
  select exists (
    select 1 from public.admin_roles where user_id = v_actor_id and role = 'global_admin'
  ) into v_is_global_admin;
  select * into v_reservation from public.reservations where id = p_reservation_id for update;
  v_claim := v_reservation.data -> 'remainingSeatClaim';

  if v_reservation.id is null or v_claim ->> 'status' <> 'pending_payment' then
    raise exception 'Pending remaining seat claim not found.';
  end if;
  if v_reservation.user_id is distinct from v_actor_id and not v_is_global_admin then
    raise exception 'Not authorized to cancel this remaining seat claim.';
  end if;

  select status into v_payment_status
  from public.payments
  where reservation_id = p_reservation_id
  for update;

  if v_payment_status = 'completed' then
    raise exception 'Payment-confirmed remaining seat claims cannot be cancelled.';
  end if;

  select allocation_data into v_allocation_data
  from public.bus_allocations where id = (v_claim ->> 'allocationId')::uuid for update;
  if v_allocation_data is not null then
    update public.bus_allocations
    set allocation_data = jsonb_set(
      v_allocation_data, '{passengers}',
      (
        select coalesce(jsonb_agg(passenger), '[]'::jsonb)
        from jsonb_array_elements(coalesce(v_allocation_data -> 'passengers', '[]'::jsonb)) passenger
        where passenger ->> 'reservationId' <> p_reservation_id::text
      ), true
    )
    where id = (v_claim ->> 'allocationId')::uuid;
  end if;

  delete from public.reservations where id = p_reservation_id;
  return true;
end;
$$;

notify pgrst, 'reload schema';
