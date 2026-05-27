-- =========================================================
-- Reset reservation operation data
-- Run this in Supabase SQL Editor.
--
-- Keeps setup data:
-- - districts / teams / campuses
-- - stations
-- - admin_roles
-- - bus_options
-- - app_settings
--
-- Clears operation data:
-- - reservations and payments
-- - campus_transfers
-- - bus_allocations
-- - campus_requests and messages
-- =========================================================

create or replace function reset_reservation_data()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_deleted_reservations integer := 0;
  v_deleted_payments integer := 0;
  v_deleted_campus_transfers integer := 0;
  v_deleted_bus_allocations integer := 0;
  v_deleted_campus_requests integer := 0;
  v_deleted_campus_request_messages integer := 0;
begin
  if not exists (
    select 1
    from admin_roles
    where admin_roles.user_id = auth.uid()
      and admin_roles.role = 'global_admin'
  ) then
    raise exception 'Only global admins can reset reservation data.';
  end if;

  delete from campus_request_messages;
  get diagnostics v_deleted_campus_request_messages = row_count;

  delete from campus_requests;
  get diagnostics v_deleted_campus_requests = row_count;

  delete from campus_transfers;
  get diagnostics v_deleted_campus_transfers = row_count;

  delete from bus_allocations;
  get diagnostics v_deleted_bus_allocations = row_count;

  delete from payments;
  get diagnostics v_deleted_payments = row_count;

  delete from reservations;
  get diagnostics v_deleted_reservations = row_count;

  return jsonb_build_object(
    'reservations', v_deleted_reservations,
    'payments', v_deleted_payments,
    'campusTransfers', v_deleted_campus_transfers,
    'busAllocations', v_deleted_bus_allocations,
    'campusRequests', v_deleted_campus_requests,
    'campusRequestMessages', v_deleted_campus_request_messages
  );
end;
$$;

grant execute on function reset_reservation_data() to authenticated;

notify pgrst, 'reload schema';
