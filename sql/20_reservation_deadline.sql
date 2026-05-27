-- =========================================================
-- First reservation deadline setting
-- Run after 05_app_settings.sql.
--
-- Stores:
-- - key: first_reservation_deadline
-- - value: { "deadline_at": "ISO timestamp or null" }
-- =========================================================

insert into app_settings (key, value)
values ('first_reservation_deadline', '{"deadline_at": null}'::jsonb)
on conflict (key) do nothing;
