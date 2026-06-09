-- Complete individual user operations with atomic state transitions and audit snapshots.

alter table public.payments drop constraint if exists payments_status_check;
alter table public.payments
  add constraint payments_status_check
  check (status in ('pending', 'completed', 'refund_required', 'refunded'));

alter table public.personal_user_action_logs
  add column if not exists before_data jsonb;
alter table public.personal_user_action_logs
  add column if not exists after_data jsonb;
alter table public.personal_user_action_logs
  add column if not exists reversible boolean not null default false;
alter table public.personal_user_action_logs
  add column if not exists reverted_at timestamptz;
alter table public.personal_user_action_logs
  add column if not exists reverted_by uuid references auth.users(id) on delete set null;

create or replace function public.mark_personal_notification_read(p_notification_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.personal_notifications
  set read_at = coalesce(read_at, clock_timestamp())
  where id = p_notification_id and target_user_id = auth.uid();
end;
$$;

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

  if p_next_status = 'cancelled' and v_payment.status = 'completed' then
    update public.payments
    set status = 'refund_required', notes = btrim(p_reason), updated_at = clock_timestamp()
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
  if p_status not in ('pending', 'completed', 'refund_required', 'refunded') then raise exception 'Invalid payment status.'; end if;
  if nullif(btrim(p_reason), '') is null then raise exception 'A reason is required.'; end if;

  select * into v_reservation from public.reservations where id = p_reservation_id for update;
  if not found then raise exception 'Reservation not found.'; end if;
  select status into v_before_status from public.payments where reservation_id = p_reservation_id for update;

  insert into public.payments (user_id, reservation_id, amount, status, paid_at, verified_by, verified_at, notes)
  values (
    v_reservation.user_id, v_reservation.id, 0, p_status,
    case when p_status = 'completed' then clock_timestamp() end,
    auth.uid(), clock_timestamp(), btrim(p_reason)
  )
  on conflict (reservation_id) where reservation_id is not null do update set
    status = excluded.status,
    paid_at = case when excluded.status = 'completed' then clock_timestamp() else payments.paid_at end,
    verified_by = auth.uid(), verified_at = clock_timestamp(),
    notes = btrim(p_reason), updated_at = clock_timestamp();

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

create or replace function public.update_personal_user_organization(
  p_target_user_id uuid,
  p_reservation_id uuid,
  p_campus_id uuid,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_before jsonb;
begin
  if not public.is_global_admin() then raise exception 'Only global admins can update personal user organization.'; end if;
  if nullif(btrim(p_reason), '') is null then raise exception 'A reason is required.'; end if;
  select to_jsonb(profile) into v_before from public.profiles profile where id = p_target_user_id for update;

  update public.profiles set campus_id = p_campus_id, updated_at = clock_timestamp() where id = p_target_user_id;
  if p_reservation_id is not null then
    update public.reservations set campus_id = p_campus_id, updated_at = clock_timestamp()
    where id = p_reservation_id and user_id = p_target_user_id;
  end if;

  insert into public.personal_user_action_logs (
    target_user_id, reservation_id, actor_id, action, reason, before_data, after_data, reversible
  )
  select p_target_user_id, p_reservation_id, auth.uid(), 'organization_updated', btrim(p_reason),
    jsonb_build_object('district', v_before ->> 'district', 'team', v_before ->> 'team', 'campus', v_before ->> 'campus', 'campusId', v_before ->> 'campus_id'),
    jsonb_build_object('district', profile.district, 'team', profile.team, 'campus', profile.campus, 'campusId', profile.campus_id),
    true
  from public.profiles profile where profile.id = p_target_user_id;
end;
$$;

create or replace function public.update_personal_user_info(
  p_target_user_id uuid,
  p_reservation_id uuid,
  p_name text,
  p_phone text,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_phone text := regexp_replace(coalesce(p_phone, ''), '[^0-9]', '', 'g');
  v_before jsonb;
begin
  if not public.is_global_admin() then raise exception 'Only global admins can update personal user information.'; end if;
  if nullif(btrim(p_name), '') is null or v_phone !~ '^01[016789][0-9]{7,8}$' then raise exception 'A valid name and phone are required.'; end if;
  if nullif(btrim(p_reason), '') is null then raise exception 'A reason is required.'; end if;
  if exists (
    select 1 from public.profiles
    where id <> p_target_user_id and regexp_replace(coalesce(phone, ''), '[^0-9]', '', 'g') = v_phone
  ) then raise exception 'Another user already uses this phone number.'; end if;

  select jsonb_build_object('name', name, 'phone', phone) into v_before
  from public.profiles where id = p_target_user_id for update;

  update public.profiles
  set name = btrim(p_name), phone = v_phone, updated_at = clock_timestamp()
  where id = p_target_user_id;
  if p_reservation_id is not null then
    update public.reservations
    set name = btrim(p_name), phone = v_phone,
      data = jsonb_set(jsonb_set(coalesce(data, '{}'::jsonb), '{name}', to_jsonb(btrim(p_name)), true), '{phone}', to_jsonb(v_phone), true),
      updated_at = clock_timestamp()
    where id = p_reservation_id and user_id = p_target_user_id;
  end if;

  insert into public.personal_user_action_logs (
    target_user_id, reservation_id, actor_id, action, reason, before_data, after_data, reversible
  ) values (
    p_target_user_id, p_reservation_id, auth.uid(), 'user_info_updated', btrim(p_reason),
    v_before, jsonb_build_object('name', btrim(p_name), 'phone', v_phone), false
  );
end;
$$;

create or replace function public.revert_personal_user_action(p_action_log_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_log public.personal_user_action_logs%rowtype;
begin
  if not public.is_global_admin() then raise exception 'Only global admins can revert personal user actions.'; end if;
  if nullif(btrim(p_reason), '') is null then raise exception 'A reason is required.'; end if;
  select * into v_log from public.personal_user_action_logs where id = p_action_log_id for update;
  if not found or not v_log.reversible or v_log.reverted_at is not null then raise exception 'This action cannot be reverted.'; end if;

  if v_log.action like 'payment_%' then
    update public.payments
    set status = coalesce(v_log.before_data ->> 'paymentStatus', 'pending'),
        notes = '되돌리기: ' || btrim(p_reason), updated_at = clock_timestamp()
    where reservation_id = v_log.reservation_id;
  elsif v_log.action = 'organization_updated' then
    update public.profiles set campus_id = nullif(v_log.before_data ->> 'campusId', '')::uuid
    where id = v_log.target_user_id;
    update public.reservations set campus_id = nullif(v_log.before_data ->> 'campusId', '')::uuid
    where id = v_log.reservation_id;
  else
    raise exception 'This action cannot be reverted.';
  end if;

  update public.personal_user_action_logs
  set reverted_at = clock_timestamp(), reverted_by = auth.uid()
  where id = v_log.id;

  insert into public.personal_user_action_logs (
    target_user_id, reservation_id, actor_id, action, reason, before_data, after_data, reversible
  ) values (
    v_log.target_user_id, v_log.reservation_id, auth.uid(), 'action_reverted', btrim(p_reason),
    v_log.after_data, v_log.before_data, false
  );
end;
$$;

create or replace function public.bulk_manage_personal_user_payments(
  p_reservation_ids uuid[], p_status text, p_reason text
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare v_id uuid; v_count integer := 0;
begin
  if coalesce(array_length(p_reservation_ids, 1), 0) > 100 then raise exception 'Bulk operation is limited to 100 users.'; end if;
  foreach v_id in array coalesce(p_reservation_ids, array[]::uuid[]) loop
    perform public.manage_personal_user_payment(v_id, p_status, p_reason);
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

create or replace function public.bulk_send_personal_notifications(
  p_target_user_ids uuid[], p_title text, p_content text, p_category text default 'admin'
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare v_id uuid; v_count integer := 0;
begin
  if coalesce(array_length(p_target_user_ids, 1), 0) > 100 then raise exception 'Bulk operation is limited to 100 users.'; end if;
  foreach v_id in array coalesce(p_target_user_ids, array[]::uuid[]) loop
    perform public.send_personal_notification(v_id, p_title, p_content, p_category);
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

revoke all on function public.mark_personal_notification_read(uuid) from public, anon;
revoke all on function public.manage_personal_reservation_status(uuid, text, text) from public, anon;
revoke all on function public.update_personal_user_organization(uuid, uuid, uuid, text) from public, anon;
revoke all on function public.revert_personal_user_action(uuid, text) from public, anon;
revoke all on function public.bulk_manage_personal_user_payments(uuid[], text, text) from public, anon;
revoke all on function public.bulk_send_personal_notifications(uuid[], text, text, text) from public, anon;
grant execute on function public.mark_personal_notification_read(uuid) to authenticated;
grant execute on function public.manage_personal_reservation_status(uuid, text, text) to authenticated;
grant execute on function public.update_personal_user_organization(uuid, uuid, uuid, text) to authenticated;
grant execute on function public.revert_personal_user_action(uuid, text) to authenticated;
grant execute on function public.bulk_manage_personal_user_payments(uuid[], text, text) to authenticated;
grant execute on function public.bulk_send_personal_notifications(uuid[], text, text, text) to authenticated;

notify pgrst, 'reload schema';
