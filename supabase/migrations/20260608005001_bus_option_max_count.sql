-- Add the per-option bus inventory limit required by the admin UI.

alter table public.bus_options
  add column if not exists max_count integer not null default 999;

alter table public.bus_options
  drop constraint if exists bus_options_max_count_positive;

alter table public.bus_options
  add constraint bus_options_max_count_positive check (max_count > 0);

notify pgrst, 'reload schema';
