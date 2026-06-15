-- Individual user operations, reasons, and in-app notifications.

create table if not exists public.personal_notifications (
  id uuid primary key default gen_random_uuid(),
  target_user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  content text not null,
  category text not null default 'general',
  created_by uuid references auth.users(id) on delete set null,
  read_at timestamptz,
  created_at timestamptz not null default clock_timestamp()
);

create index if not exists idx_personal_notifications_target_created
  on public.personal_notifications(target_user_id, created_at desc);

create table if not exists public.personal_user_action_logs (
  id uuid primary key default gen_random_uuid(),
  target_user_id uuid not null references auth.users(id) on delete cascade,
  reservation_id uuid references public.reservations(id) on delete set null,
  actor_id uuid references auth.users(id) on delete set null,
  action text not null,
  reason text not null,
  created_at timestamptz not null default clock_timestamp()
);

create index if not exists idx_personal_user_action_logs_target_created
  on public.personal_user_action_logs(target_user_id, created_at desc);

alter table public.personal_notifications enable row level security;
alter table public.personal_user_action_logs enable row level security;

drop policy if exists "Users can view own personal notifications" on public.personal_notifications;
create policy "Users can view own personal notifications"
on public.personal_notifications for select to authenticated
using (target_user_id = auth.uid() or public.is_global_admin());

drop policy if exists "Global admins can view personal user action logs" on public.personal_user_action_logs;
create policy "Global admins can view personal user action logs"
on public.personal_user_action_logs for select to authenticated
using (public.is_global_admin());

revoke insert, update, delete on public.personal_notifications from public, anon, authenticated;
revoke insert, update, delete on public.personal_user_action_logs from public, anon, authenticated;
grant select on public.personal_notifications to authenticated;
grant select on public.personal_user_action_logs to authenticated;

create or replace function public.record_personal_user_action(
  p_target_user_id uuid,
  p_reservation_id uuid,
  p_action text,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_global_admin() then
    raise exception 'Only global admins can record personal user actions.';
  end if;

  if nullif(btrim(p_reason), '') is null then
    raise exception 'A reason is required.';
  end if;

  insert into public.personal_user_action_logs (
    target_user_id, reservation_id, actor_id, action, reason
  )
  values (
    p_target_user_id, p_reservation_id, auth.uid(), p_action, btrim(p_reason)
  );
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
begin
  if not public.is_global_admin() then
    raise exception 'Only global admins can manage personal payments.';
  end if;

  if p_status not in ('pending', 'completed', 'refunded') then
    raise exception 'Invalid payment status.';
  end if;

  if nullif(btrim(p_reason), '') is null then
    raise exception 'A reason is required.';
  end if;

  select * into v_reservation
  from public.reservations
  where id = p_reservation_id
  for update;

  if not found then
    raise exception 'Reservation not found.';
  end if;

  insert into public.payments (
    user_id, reservation_id, amount, status, paid_at, verified_by, verified_at, notes
  )
  values (
    v_reservation.user_id,
    v_reservation.id,
    0,
    p_status,
    case when p_status = 'completed' then clock_timestamp() end,
    auth.uid(),
    clock_timestamp(),
    btrim(p_reason)
  )
  on conflict (reservation_id)
  where reservation_id is not null
  do update set
    status = excluded.status,
    paid_at = case when excluded.status = 'completed' then clock_timestamp() else payments.paid_at end,
    verified_by = auth.uid(),
    verified_at = clock_timestamp(),
    notes = btrim(p_reason),
    updated_at = clock_timestamp();

  perform public.record_personal_user_action(
    v_reservation.user_id,
    v_reservation.id,
    'payment_' || p_status,
    p_reason
  );
end;
$$;

create or replace function public.send_personal_notification(
  p_target_user_id uuid,
  p_title text,
  p_content text,
  p_category text default 'general'
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_notification_id uuid;
begin
  if not public.is_global_admin() then
    raise exception 'Only global admins can send personal notifications.';
  end if;

  if nullif(btrim(p_title), '') is null or nullif(btrim(p_content), '') is null then
    raise exception 'Notification title and content are required.';
  end if;

  insert into public.personal_notifications (
    target_user_id, title, content, category, created_by
  )
  values (
    p_target_user_id,
    btrim(p_title),
    btrim(p_content),
    coalesce(nullif(btrim(p_category), ''), 'general'),
    auth.uid()
  )
  returning id into v_notification_id;

  perform public.record_personal_user_action(
    p_target_user_id,
    null,
    'notification_sent',
    btrim(p_title)
  );

  return v_notification_id;
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
begin
  if not public.is_global_admin() then
    raise exception 'Only global admins can update personal user information.';
  end if;

  if nullif(btrim(p_name), '') is null or nullif(btrim(p_phone), '') is null then
    raise exception 'Name and phone are required.';
  end if;

  if nullif(btrim(p_reason), '') is null then
    raise exception 'A reason is required.';
  end if;

  update public.profiles
  set name = btrim(p_name), phone = btrim(p_phone), updated_at = clock_timestamp()
  where id = p_target_user_id;

  if p_reservation_id is not null then
    update public.reservations
    set
      name = btrim(p_name),
      phone = btrim(p_phone),
      data = jsonb_set(
        jsonb_set(coalesce(data, '{}'::jsonb), '{name}', to_jsonb(btrim(p_name)), true),
        '{phone}',
        to_jsonb(btrim(p_phone)),
        true
      ),
      updated_at = clock_timestamp()
    where id = p_reservation_id and user_id = p_target_user_id;
  end if;

  perform public.record_personal_user_action(
    p_target_user_id,
    p_reservation_id,
    'user_info_updated',
    p_reason
  );
end;
$$;

revoke all on function public.record_personal_user_action(uuid, uuid, text, text) from public, anon;
revoke all on function public.manage_personal_user_payment(uuid, text, text) from public, anon;
revoke all on function public.send_personal_notification(uuid, text, text, text) from public, anon;
revoke all on function public.update_personal_user_info(uuid, uuid, text, text, text) from public, anon;
grant execute on function public.record_personal_user_action(uuid, uuid, text, text) to authenticated;
grant execute on function public.manage_personal_user_payment(uuid, text, text) to authenticated;
grant execute on function public.send_personal_notification(uuid, text, text, text) to authenticated;
grant execute on function public.update_personal_user_info(uuid, uuid, text, text, text) to authenticated;

notify pgrst, 'reload schema';
