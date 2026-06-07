-- =========================================================
-- Store allocation workspace versions outside the hot row.
-- Run after 55_atomic_allocation_confirmation.sql.
-- =========================================================

create table if not exists public.allocation_workspace_versions (
  id text primary key,
  allocation_id uuid not null
    references public.bus_allocations(id) on delete cascade,
  revision bigint not null,
  label text not null,
  actor_id text not null,
  changes jsonb not null default '[]'::jsonb,
  snapshot jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_allocation_workspace_versions_allocation_created
  on public.allocation_workspace_versions(allocation_id, created_at desc);

alter table public.allocation_workspace_versions enable row level security;

revoke all on table public.allocation_workspace_versions from public, anon, authenticated;

-- Move legacy embedded versions before removing them from the frequently updated row.
insert into public.allocation_workspace_versions (
  id,
  allocation_id,
  revision,
  label,
  actor_id,
  changes,
  snapshot,
  created_at
)
select
  version.value ->> 'id',
  allocation.id,
  version.ordinality,
  coalesce(nullif(version.value ->> 'label', ''), 'Legacy save ' || version.ordinality),
  coalesce(nullif(version.value ->> 'actorId', ''), 'unknown'),
  coalesce(history.value -> 'changes', '[]'::jsonb),
  jsonb_build_object(
    'buses', coalesce(version.value -> 'buses', '[]'::jsonb),
    'passengers', coalesce(version.value -> 'passengers', '[]'::jsonb)
  ),
  coalesce(
    nullif(version.value ->> 'createdAt', '')::timestamptz,
    allocation.created_at
  )
from public.bus_allocations allocation
cross join lateral jsonb_array_elements(
  coalesce(allocation.allocation_data -> 'versions', '[]'::jsonb)
) with ordinality version(value, ordinality)
left join lateral (
  select history_item.value
  from jsonb_array_elements(
    coalesce(allocation.allocation_data -> 'history', '[]'::jsonb)
  ) history_item(value)
  where history_item.value ->> 'versionId' = version.value ->> 'id'
  limit 1
) history on true
where nullif(version.value ->> 'id', '') is not null
on conflict (id) do nothing;

update public.bus_allocations
set allocation_data = jsonb_set(
  allocation_data - 'versions',
  '{schemaVersion}',
  '2'::jsonb,
  true
)
where allocation_data ? 'versions'
   or (
     allocation_data ? 'buses'
     and allocation_data ? 'passengers'
     and allocation_data ->> 'schemaVersion' is distinct from '2'
   );

create or replace function public.store_allocation_workspace_version(
  p_allocation_id uuid,
  p_revision bigint,
  p_allocation_data jsonb,
  p_version_id text,
  p_version_label text,
  p_version_changes jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.allocation_workspace_versions (
    id,
    allocation_id,
    revision,
    label,
    actor_id,
    changes,
    snapshot
  )
  values (
    p_version_id,
    p_allocation_id,
    p_revision,
    p_version_label,
    auth.uid()::text,
    coalesce(p_version_changes, '[]'::jsonb),
    jsonb_build_object(
      'buses', coalesce(p_allocation_data -> 'buses', '[]'::jsonb),
      'passengers', coalesce(p_allocation_data -> 'passengers', '[]'::jsonb)
    )
  );

  delete from public.allocation_workspace_versions version
  where version.id in (
    select old_version.id
    from public.allocation_workspace_versions old_version
    where old_version.allocation_id = p_allocation_id
    order by old_version.created_at desc, old_version.id desc
    offset 20
  );
end;
$$;

create or replace function public.get_allocation_workspace_versions(
  p_allocation_id uuid
)
returns table (
  id text,
  created_at timestamptz,
  actor_id text,
  label text,
  changes jsonb
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or not public.is_global_admin() then
    raise exception 'Only global admins can view allocation versions.';
  end if;

  return query
  select
    version.id,
    version.created_at,
    version.actor_id,
    version.label,
    version.changes
  from public.allocation_workspace_versions version
  where version.allocation_id = p_allocation_id
  order by version.created_at desc, version.id desc;
end;
$$;

create or replace function public.get_allocation_workspace_version_snapshot(
  p_version_id text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_snapshot jsonb;
begin
  if auth.uid() is null or not public.is_global_admin() then
    raise exception 'Only global admins can view allocation versions.';
  end if;

  select version.snapshot
  into v_snapshot
  from public.allocation_workspace_versions version
  where version.id = p_version_id;

  if v_snapshot is null then
    raise exception 'Allocation workspace version not found.';
  end if;

  return v_snapshot;
end;
$$;

create or replace function public.save_draft_allocation_workspace_v2(
  p_allocation_id uuid,
  p_expected_revision bigint,
  p_allocation_data jsonb,
  p_total_cost integer,
  p_total_capacity integer,
  p_version_id text,
  p_version_label text,
  p_version_changes jsonb
)
returns setof public.bus_allocations
language plpgsql
security definer
set search_path = public
as $$
declare
  v_saved public.bus_allocations%rowtype;
begin
  select *
  into v_saved
  from public.save_draft_allocation_workspace(
    p_allocation_id,
    p_expected_revision,
    p_allocation_data - 'versions',
    p_total_cost,
    p_total_capacity
  );

  perform public.store_allocation_workspace_version(
    p_allocation_id,
    v_saved.revision,
    p_allocation_data,
    p_version_id,
    p_version_label,
    p_version_changes
  );

  return next v_saved;
end;
$$;

create or replace function public.save_confirmed_allocation_workspace_v2(
  p_allocation_id uuid,
  p_expected_revision bigint,
  p_allocation_data jsonb,
  p_total_cost integer,
  p_total_capacity integer,
  p_version_id text,
  p_version_label text,
  p_version_changes jsonb
)
returns setof public.bus_allocations
language plpgsql
security definer
set search_path = public
as $$
declare
  v_saved public.bus_allocations%rowtype;
begin
  select *
  into v_saved
  from public.save_confirmed_allocation_workspace(
    p_allocation_id,
    p_expected_revision,
    p_allocation_data - 'versions',
    p_total_cost,
    p_total_capacity
  );

  perform public.store_allocation_workspace_version(
    p_allocation_id,
    v_saved.revision,
    p_allocation_data,
    p_version_id,
    p_version_label,
    p_version_changes
  );

  return next v_saved;
end;
$$;

create or replace function public.cancel_confirmed_allocation_workspace_v2(
  p_allocation_id uuid,
  p_expected_revision bigint,
  p_allocation_data jsonb,
  p_total_cost integer,
  p_total_capacity integer,
  p_version_id text,
  p_version_label text,
  p_version_changes jsonb
)
returns setof public.bus_allocations
language plpgsql
security definer
set search_path = public
as $$
declare
  v_saved public.bus_allocations%rowtype;
begin
  select *
  into v_saved
  from public.cancel_confirmed_allocation_workspace(
    p_allocation_id,
    p_expected_revision,
    p_allocation_data - 'versions',
    p_total_cost,
    p_total_capacity
  );

  perform public.store_allocation_workspace_version(
    p_allocation_id,
    v_saved.revision,
    p_allocation_data,
    p_version_id,
    p_version_label,
    p_version_changes
  );

  return next v_saved;
end;
$$;

revoke all on function public.store_allocation_workspace_version(
  uuid, bigint, jsonb, text, text, jsonb
) from public, anon, authenticated;

revoke all on function public.get_allocation_workspace_versions(uuid)
  from public, anon;
grant execute on function public.get_allocation_workspace_versions(uuid)
  to authenticated;

revoke all on function public.get_allocation_workspace_version_snapshot(text)
  from public, anon;
grant execute on function public.get_allocation_workspace_version_snapshot(text)
  to authenticated;

revoke all on function public.save_draft_allocation_workspace_v2(
  uuid, bigint, jsonb, integer, integer, text, text, jsonb
) from public, anon;
grant execute on function public.save_draft_allocation_workspace_v2(
  uuid, bigint, jsonb, integer, integer, text, text, jsonb
) to authenticated;

revoke all on function public.save_confirmed_allocation_workspace_v2(
  uuid, bigint, jsonb, integer, integer, text, text, jsonb
) from public, anon;
grant execute on function public.save_confirmed_allocation_workspace_v2(
  uuid, bigint, jsonb, integer, integer, text, text, jsonb
) to authenticated;

revoke all on function public.cancel_confirmed_allocation_workspace_v2(
  uuid, bigint, jsonb, integer, integer, text, text, jsonb
) from public, anon;
grant execute on function public.cancel_confirmed_allocation_workspace_v2(
  uuid, bigint, jsonb, integer, integer, text, text, jsonb
) to authenticated;

notify pgrst, 'reload schema';
