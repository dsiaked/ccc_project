-- Adds an inventory limit for each pre-registered bus option.

alter table bus_options
  add column if not exists max_count integer not null default 999;

alter table bus_options
  drop constraint if exists bus_options_max_count_positive;

alter table bus_options
  add constraint bus_options_max_count_positive check (max_count > 0);
