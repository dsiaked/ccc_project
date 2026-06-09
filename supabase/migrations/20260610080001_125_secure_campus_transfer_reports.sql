-- Validate campus transfer reports against current server-side payment totals.

create or replace function public.mark_campus_transfer_sent(
  p_district text,
  p_team text,
  p_campus text,
  p_total_people integer,
  p_paid_people integer,
  p_total_amount integer,
  p_sent_by uuid
)
returns public.campus_transfers
language plpgsql
security definer
set search_path = public
as $$
declare
  v_transfer public.campus_transfers;
  v_existing public.campus_transfers;
  v_scope record;
  v_total_people integer;
  v_paid_people integer;
  v_total_amount integer;
begin
  select district_id, team_id, campus_id
  into v_scope
  from public.campus_options
  where district = p_district
    and team = p_team
    and campus = p_campus
  limit 1;

  if not found then
    raise exception 'Campus transfer scope is invalid.';
  end if;

  if auth.uid() is null or not exists (
    select 1
    from public.admin_roles admin_role
    where admin_role.user_id = auth.uid()
      and (
        admin_role.role = 'global_admin'
        or (
          admin_role.role = 'campus_admin'
          and (
            admin_role.campus_id = v_scope.campus_id
            or (
              admin_role.district = p_district
              and admin_role.team = p_team
              and admin_role.campus = p_campus
            )
          )
        )
      )
  ) then
    raise exception 'Not authorized to report this campus transfer.';
  end if;

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
      reservation.campus_id = v_scope.campus_id
      or (
        reservation.district = p_district
        and reservation.team = p_team
        and reservation.campus = p_campus
      )
    );

  v_total_amount := v_total_people * public.get_bus_ticket_price();

  if v_total_people <= 0 then
    raise exception 'No active reservations are available for this campus transfer.';
  end if;
  if v_paid_people <> v_total_people then
    raise exception 'Every active reservation must be paid before reporting a campus transfer.';
  end if;
  if p_total_people is distinct from v_total_people
    or p_paid_people is distinct from v_paid_people
    or p_total_amount is distinct from v_total_amount then
    raise exception 'Campus transfer totals changed. Refresh and try again.';
  end if;

  select *
  into v_existing
  from public.campus_transfers transfer
  where transfer.district = p_district
    and transfer.team = p_team
    and transfer.campus = p_campus
  for update;

  if v_existing.id is not null
    and v_existing.status = 'confirmed'
    and v_total_people <= v_existing.total_people
    and v_paid_people <= v_existing.paid_people
    and v_total_amount <= v_existing.total_amount then
    raise exception 'A confirmed campus transfer can only be reported again for additional settlement.';
  end if;

  insert into public.campus_transfers (
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
    v_scope.district_id,
    v_scope.team_id,
    v_scope.campus_id,
    p_district,
    p_team,
    p_campus,
    v_total_people,
    v_paid_people,
    v_total_amount,
    'sent',
    auth.uid(),
    clock_timestamp(),
    null,
    null,
    null,
    clock_timestamp()
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
    sent_at = excluded.sent_at,
    confirmed_by = null,
    confirmed_at = null,
    actual_confirmed_amount = null,
    updated_at = excluded.updated_at
  returning * into v_transfer;

  return v_transfer;
end;
$$;

revoke all on function public.mark_campus_transfer_sent(
  text, text, text, integer, integer, integer, uuid
) from public, anon;
grant execute on function public.mark_campus_transfer_sent(
  text, text, text, integer, integer, integer, uuid
) to authenticated;

notify pgrst, 'reload schema';
