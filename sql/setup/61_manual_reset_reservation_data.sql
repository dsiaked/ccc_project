-- =========================================================
-- Manual reset reservation operation data
-- Run this in Supabase SQL Editor when you want to reset data directly.
--
-- This immediately deletes operation data.
-- Keeps setup data:
-- - districts / teams / campuses
-- - stations
-- - admin_roles
-- - bus_options
-- - app_settings
-- =========================================================

begin;

delete from campus_request_messages where true;
delete from campus_requests where true;
delete from campus_transfers where true;
delete from bus_allocations where true;
delete from payments where true;
delete from reservations where true;

commit;

select
  (select count(*) from reservations) as reservations,
  (select count(*) from payments) as payments,
  (select count(*) from campus_transfers) as campus_transfers,
  (select count(*) from bus_allocations) as bus_allocations,
  (select count(*) from campus_requests) as campus_requests,
  (select count(*) from campus_request_messages) as campus_request_messages;
