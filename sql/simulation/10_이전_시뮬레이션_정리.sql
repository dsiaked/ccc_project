-- =========================================================
-- CCC Bus simulation: cleanup previous run
-- Deletes only data owned by sim-%@ccc-bus.test users and SIM-tagged rows.
-- Run files in sql/simulation/README.md order.
-- =========================================================

begin;

-- =========================================================
-- 2. Clean previous simulation-only data
-- =========================================================

delete from campus_request_messages
where sender_id in (
    select id from auth.users where email like 'sim-%@ccc-bus.test'
  )
  or request_id in (
    select id
    from campus_requests
    where created_by in (
      select id from auth.users where email like 'sim-%@ccc-bus.test'
    )
  );

delete from campus_requests
where created_by in (
  select id from auth.users where email like 'sim-%@ccc-bus.test'
);

update campus_requests
set handled_by = null,
    handled_at = null,
    updated_at = now()
where handled_by in (
  select id from auth.users where email like 'sim-%@ccc-bus.test'
);

delete from campus_transfers
where sent_by in (
    select id from auth.users where email like 'sim-%@ccc-bus.test'
  )
  or confirmed_by in (
    select id from auth.users where email like 'sim-%@ccc-bus.test'
  );

delete from bus_allocations
where allocation_name like 'SIM-%'
  or created_by in (
    select id from auth.users where email like 'sim-%@ccc-bus.test'
  );

delete from bus_options
where notes like 'SIM-%';

update payments
set verified_by = null,
    verified_at = null,
    updated_at = now()
where verified_by in (
  select id from auth.users where email like 'sim-%@ccc-bus.test'
);

delete from payments
where user_id in (
  select id from auth.users where email like 'sim-%@ccc-bus.test'
);

delete from reservations
where user_id in (
  select id from auth.users where email like 'sim-%@ccc-bus.test'
);

update admin_roles
set granted_by = null,
    updated_at = now()
where granted_by in (
  select id from auth.users where email like 'sim-%@ccc-bus.test'
);

delete from admin_roles
where user_id in (
  select id from auth.users where email like 'sim-%@ccc-bus.test'
);

delete from profiles
where email like 'sim-%@ccc-bus.test';

delete from auth.identities
where user_id in (
  select id from auth.users where email like 'sim-%@ccc-bus.test'
);

delete from auth.users
where email like 'sim-%@ccc-bus.test';

commit;
