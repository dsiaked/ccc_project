-- =========================================================
-- Simulation runtime safety and stage execution history
-- Run after 05_app_settings.sql and 99_finalize_setup.sql.
-- =========================================================

insert into public.app_settings (key, value)
values ('simulation_enabled', '{"enabled": false}'::jsonb)
on conflict (key) do nothing;

create table if not exists public.simulation_stage_runs (
  id uuid primary key default gen_random_uuid(),
  stage text not null,
  status text not null check (status in ('running', 'completed', 'failed')),
  requested_by uuid not null references auth.users(id),
  summary jsonb not null default '{}'::jsonb,
  error_message text,
  started_at timestamptz not null default now(),
  completed_at timestamptz
);

create index if not exists idx_simulation_stage_runs_started_at
  on public.simulation_stage_runs(started_at desc);

alter table public.simulation_stage_runs enable row level security;

drop policy if exists "Global admins can view simulation stage runs"
  on public.simulation_stage_runs;

create policy "Global admins can view simulation stage runs"
on public.simulation_stage_runs
for select
to authenticated
using (public.is_global_admin());

revoke all on table public.simulation_stage_runs from public, anon;
grant select on table public.simulation_stage_runs to authenticated;

notify pgrst, 'reload schema';
