-- Expose trusted admin-created account source to administrator and boarding UIs.

do $$
declare
  v_definition text;
begin
  select pg_get_functiondef(
    'public.get_admin_personal_ticket_page(integer,integer,text,text,text,text,text,text,text)'::regprocedure
  )
  into v_definition;

  if position('''account_source'', row.account_source' in v_definition) = 0 then
    v_definition := replace(
      v_definition,
      'profile.password as password,
      profile.created_at as created_at',
      'profile.password as password,
      profile.account_source as account_source,
      profile.created_at as created_at'
    );

    if position('account_source as account_source' in v_definition) = 0 then
      v_definition := replace(
        v_definition,
        'profile.password as password',
        'profile.password as password,
      profile.account_source as account_source'
      );
    end if;

    v_definition := replace(
      v_definition,
      '''password'', row.password',
      '''password'', row.password,
            ''account_source'', row.account_source'
    );
  end if;

  if position('account_source as account_source' in v_definition) = 0
    or position('''account_source'', row.account_source' in v_definition) = 0 then
    raise exception 'Could not patch get_admin_personal_ticket_page account_source exposure.';
  end if;

  execute v_definition;
end;
$$;

do $$
declare
  v_definition text;
begin
  select pg_get_functiondef('public.get_boarding_management_snapshot()'::regprocedure)
  into v_definition;

  if position('''accountSource'', coalesce(account_profile.account_source, ''self_signup'')' in v_definition) = 0 then
    v_definition := regexp_replace(
      v_definition,
      $pattern$('campus', reservation\.campus,\s*)('busNumber',)$pattern$,
      $replacement$\1'accountSource', coalesce(account_profile.account_source, 'self_signup'),
          \2$replacement$
    );
  end if;

  if position('left join public.profiles account_profile on account_profile.id = reservation.user_id' in v_definition) = 0 then
    v_definition := regexp_replace(
      v_definition,
      $pattern$(from public\.reservations reservation\s+)left join public\.profiles status_actor$pattern$,
      $replacement$\1left join public.profiles account_profile on account_profile.id = reservation.user_id
        left join public.profiles status_actor$replacement$
    );
  end if;

  if position('''accountSource'', coalesce(account_profile.account_source, ''self_signup'')' in v_definition) = 0
    or position('left join public.profiles account_profile on account_profile.id = reservation.user_id' in v_definition) = 0 then
    raise exception 'Could not patch get_boarding_management_snapshot accountSource exposure.';
  end if;

  execute v_definition;
end;
$$;

do $$
declare
  v_definition text;
begin
  select pg_get_functiondef('public.get_destination_queue_boarding_snapshot()'::regprocedure)
  into v_definition;

  if position('''accountSource'', coalesce(account_profile.account_source, ''self_signup'')' in v_definition) = 0 then
    v_definition := regexp_replace(
      v_definition,
      $pattern$('campus', reservation\.campus,\s*)('assignedDestination',)$pattern$,
      $replacement$\1'accountSource', coalesce(account_profile.account_source, 'self_signup'),
        \2$replacement$
    );
  end if;

  if position('''accountSource''' in v_definition) = 0 then
    v_definition := regexp_replace(
      v_definition,
      $pattern$('team', team,\s*)('assignedDestination',)$pattern$,
      $replacement$\1'accountSource', coalesce((select profile.account_source from public.profiles profile where profile.id = user_id), 'self_signup'),
        \2$replacement$
    );
  end if;

  if position('''accountSource'', coalesce(account_profile.account_source, ''self_signup'')' in v_definition) > 0
    and position('left join public.profiles account_profile on account_profile.id = reservation.user_id' in v_definition) = 0 then
    v_definition := regexp_replace(
      v_definition,
      $pattern$(from public\.reservations reservation\s+)left join public\.profiles status_actor$pattern$,
      $replacement$\1left join public.profiles account_profile on account_profile.id = reservation.user_id
      left join public.profiles status_actor$replacement$
    );
  end if;

  if position('''accountSource''' in v_definition) = 0 then
    raise exception 'Could not patch get_destination_queue_boarding_snapshot accountSource exposure.';
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
  select 235;
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
  v_deployed_version constant integer := 235;
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
