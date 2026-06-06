-- =========================================================
-- Delete every application user and all user-linked operation data
-- Run this in the Supabase SQL Editor.
--
-- Deletes:
-- - all Auth users and identities
-- - profiles and admin roles
-- - reservations and payments
-- - campus transfers and requests/messages
-- - saved bus allocations
--
-- Keeps:
-- - districts / teams / campuses
-- - stations
-- - bus options
-- - app settings
-- - home announcements (created_by becomes null)
-- =========================================================

begin;

delete from campus_request_messages where true;
delete from campus_requests where true;
delete from campus_transfers where true;
delete from bus_allocations where true;
delete from payments where true;
delete from reservations where true;
delete from admin_roles where true;
delete from profiles where true;

delete from auth.identities where true;
delete from auth.users where true;

commit;

select
  (select count(*) from auth.users) as auth_users,
  (select count(*) from auth.identities) as auth_identities,
  (select count(*) from profiles) as profiles,
  (select count(*) from admin_roles) as admin_roles,
  (select count(*) from reservations) as reservations,
  (select count(*) from payments) as payments,
  (select count(*) from campus_transfers) as campus_transfers,
  (select count(*) from campus_requests) as campus_requests,
  (select count(*) from campus_request_messages) as campus_request_messages,
  (select count(*) from bus_allocations) as bus_allocations;
