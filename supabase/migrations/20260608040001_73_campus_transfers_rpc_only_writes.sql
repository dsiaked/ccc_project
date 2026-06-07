-- =========================================================
-- Campus transfers RPC-only writes
-- =========================================================

create or replace function public.revert_campus_transfer_confirmation_as_global_admin(
  p_transfer_id uuid
)
returns public.campus_transfers
language plpgsql security definer set search_path = public
as $$
declare v_transfer public.campus_transfers;
begin
  if not public.is_global_admin() then
    raise exception 'Only global admins can revert campus transfers.';
  end if;

  update public.campus_transfers
  set status = 'sent',
      confirmed_by = null,
      confirmed_at = null,
      actual_confirmed_amount = null,
      updated_at = now()
  where id = p_transfer_id
  returning * into v_transfer;

  if v_transfer.id is null then raise exception 'Campus transfer not found.'; end if;
  return v_transfer;
end;
$$;

revoke all on function public.revert_campus_transfer_confirmation_as_global_admin(uuid) from public, anon;
grant execute on function public.revert_campus_transfer_confirmation_as_global_admin(uuid) to authenticated;

drop policy if exists "Global admins can update campus transfers" on public.campus_transfers;
revoke insert, update, delete on table public.campus_transfers from public, anon, authenticated;

notify pgrst, 'reload schema';
