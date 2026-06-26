-- Expose profile affiliation independently from reservation data.

do $$
declare
  v_definition text;
begin
  select pg_get_functiondef(
    'public.get_admin_personal_ticket_page(integer,integer,text,text,text,text,text,text,text)'::regprocedure
  )
  into v_definition;

  if position(' as affiliation_type' in v_definition) = 0 then
    v_definition := regexp_replace(
      v_definition,
      $pattern$reservation\.data as raw_data,\s*true as has_reservation(,?)$pattern$,
      $replacement$reservation.data as raw_data,
      coalesce(reservation.affiliation_type, profile.affiliation_type, 'seoul') as affiliation_type,
      coalesce(reservation.coordinator_name, profile.coordinator_name) as coordinator_name,
      coalesce(reservation.coordinator_phone, profile.coordinator_phone) as coordinator_phone,
      true as has_reservation\1$replacement$
    );

    v_definition := regexp_replace(
      v_definition,
      $pattern$null::jsonb as raw_data,\s*false as has_reservation(,?)$pattern$,
      $replacement$null::jsonb as raw_data,
      coalesce(profile.affiliation_type, 'seoul') as affiliation_type,
      profile.coordinator_name as coordinator_name,
      profile.coordinator_phone as coordinator_phone,
      false as has_reservation\1$replacement$
    );
  end if;

  if position('''affiliation_type'', row.affiliation_type' in v_definition) = 0 then
    v_definition := regexp_replace(
      v_definition,
      $pattern$('raw_data', row\.raw_data,\s*)('has_reservation', row\.has_reservation)$pattern$,
      $replacement$\1'affiliation_type', row.affiliation_type,
            'coordinator_name', row.coordinator_name,
            'coordinator_phone', row.coordinator_phone,
            \2$replacement$
    );
  end if;

  if position(' as affiliation_type' in v_definition) = 0
    or position('''affiliation_type'', row.affiliation_type' in v_definition) = 0 then
    raise exception 'Could not patch get_admin_personal_ticket_page affiliation exposure.';
  end if;

  execute v_definition;
end;
$$;

create or replace function public.get_deployment_compatibility_version()
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select 236;
$$;

create or replace function public.assert_deployment_compatibility(
  p_required_version integer
)
returns integer
language plpgsql
stable
set search_path = public
as $$
declare
  v_deployed_version constant integer := 236;
begin
  if p_required_version > v_deployed_version then
    raise exception 'Database deployment version % is older than required version %.',
      v_deployed_version,
      p_required_version;
  end if;

  return v_deployed_version;
end;
$$;

revoke all on function public.get_deployment_compatibility_version() from public;
grant execute on function public.get_deployment_compatibility_version()
to anon, authenticated, service_role;

revoke all on function public.assert_deployment_compatibility(integer) from public;
grant execute on function public.assert_deployment_compatibility(integer)
to anon, authenticated, service_role;

notify pgrst, 'reload schema';
