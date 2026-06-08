-- Allow a campus administrator to cancel a transfer report before head-office confirmation.

create or replace function public.cancel_campus_transfer_report(
  p_transfer_id uuid
)
returns public.campus_transfers
language plpgsql
security definer
set search_path = public
as $$
declare
  v_transfer public.campus_transfers;
  v_deleted_count integer;
begin
  select *
  into v_transfer
  from public.campus_transfers transfer
  where transfer.id = p_transfer_id;

  if v_transfer.id is null then
    raise exception 'Campus transfer not found.';
  end if;

  if v_transfer.status <> 'sent' then
    raise exception 'Only a reported campus transfer can be cancelled.';
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
            (
              v_transfer.campus_id is not null
              and admin_role.campus_id = v_transfer.campus_id
            )
            or (
              admin_role.district = v_transfer.district
              and admin_role.team = v_transfer.team
              and admin_role.campus = v_transfer.campus
            )
          )
        )
      )
  ) then
    raise exception 'Not authorized to cancel this campus transfer report.';
  end if;

  delete from public.campus_transfers
  where id = p_transfer_id
    and status = 'sent';

  get diagnostics v_deleted_count = row_count;
  if v_deleted_count <> 1 then
    raise exception 'Campus transfer report is no longer cancellable.';
  end if;

  return v_transfer;
end;
$$;

revoke all on function public.cancel_campus_transfer_report(uuid) from public, anon;
grant execute on function public.cancel_campus_transfer_report(uuid) to authenticated;

notify pgrst, 'reload schema';
