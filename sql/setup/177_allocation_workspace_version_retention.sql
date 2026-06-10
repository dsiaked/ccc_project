-- =========================================================
-- Retain recent allocation workspace versions without a hard 20-version cap
-- =========================================================

create or replace function public.prune_allocation_workspace_versions(
  p_allocation_id uuid default null
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_deleted_count integer;
begin
  with ranked_versions as (
    select
      version.id,
      row_number() over (
        partition by version.allocation_id
        order by version.created_at desc, version.id desc
      ) as recent_rank
    from public.allocation_workspace_versions version
    where p_allocation_id is null
      or version.allocation_id = p_allocation_id
  ),
  deleted as (
    delete from public.allocation_workspace_versions version
    using ranked_versions ranked
    where version.id = ranked.id
      and ranked.recent_rank > 20
      and version.created_at < now() - interval '90 days'
    returning 1
  )
  select count(*)::integer into v_deleted_count from deleted;

  return v_deleted_count;
end;
$$;

revoke all on function public.prune_allocation_workspace_versions(uuid)
  from public, anon, authenticated;
grant execute on function public.prune_allocation_workspace_versions(uuid)
  to service_role;

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

  perform public.prune_allocation_workspace_versions(p_allocation_id);
end;
$$;

revoke all on function public.store_allocation_workspace_version(
  uuid, bigint, jsonb, text, text, jsonb
) from public, anon, authenticated;

notify pgrst, 'reload schema';
