-- =========================================================
-- CCC Bus simulation: close reservation
-- Closes the reservation window immediately before the allocation rehearsal.
-- Run files in sql/simulation/README.md order.
-- =========================================================

begin;

-- Run this only when you are ready to rehearse admin allocation.
-- This intentionally closes the first reservation window when executed.

update app_settings
set value = jsonb_build_object('deadline_at', now() - interval '1 minute'),
    updated_at = now()
where key = 'first_reservation_deadline';

commit;
