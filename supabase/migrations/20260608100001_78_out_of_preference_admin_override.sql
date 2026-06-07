-- =========================================================
-- Allow explicitly acknowledged out-of-preference admin edits
-- =========================================================

create or replace function public.prepare_allocation_preference_override(
  p_allocation_data jsonb
)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_set(
    p_allocation_data,
    '{passengers}',
    coalesce(
      (
        select jsonb_agg(
          case
            when bus is not null
              and not (
                coalesce(passenger.value -> 'preferences', '[]'::jsonb)
                  ? (bus ->> 'destination')
              )
              then jsonb_set(
                passenger.value,
                '{preferences}',
                coalesce(passenger.value -> 'preferences', '[]'::jsonb)
                  || to_jsonb(bus ->> 'destination'),
                true
              )
            else passenger.value
          end
          order by passenger.ordinality
        )
        from jsonb_array_elements(p_allocation_data -> 'passengers')
          with ordinality passenger(value, ordinality)
        left join jsonb_array_elements(p_allocation_data -> 'buses') bus
          on bus ->> 'id' = passenger.value ->> 'busId'
      ),
      '[]'::jsonb
    ),
    true
  );
$$;

revoke all on function public.prepare_allocation_preference_override(jsonb)
  from public, anon, authenticated;

create or replace function public.validate_allocation_workspace_confirmation_v2(
  p_allocation_id uuid,
  p_allocation_data jsonb
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_has_out_of_preference boolean;
begin
  if auth.uid() is null or not public.is_global_admin() then
    raise exception 'Only global admins can validate allocations.';
  end if;

  select exists (
    select 1
    from jsonb_array_elements(coalesce(p_allocation_data -> 'passengers', '[]'::jsonb))
      passenger
    left join jsonb_array_elements(coalesce(p_allocation_data -> 'buses', '[]'::jsonb))
      bus on bus ->> 'id' = passenger ->> 'busId'
    where bus is not null
      and not (
        coalesce(passenger -> 'preferences', '[]'::jsonb)
          ? (bus ->> 'destination')
      )
  )
  into v_has_out_of_preference;

  if v_has_out_of_preference
    and coalesce((p_allocation_data ->> 'allowOutOfPreferenceOverride')::boolean, false)
      is not true then
    return public.validate_allocation_workspace_confirmation(
      p_allocation_id,
      p_allocation_data
    );
  end if;

  return public.validate_allocation_workspace_confirmation(
    p_allocation_id,
    public.prepare_allocation_preference_override(p_allocation_data)
  );
exception
  when invalid_text_representation then
    return public.validate_allocation_workspace_confirmation(
      p_allocation_id,
      p_allocation_data
    );
end;
$$;

create or replace function public.save_confirmed_allocation_workspace_v3(
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
  v_final_data jsonb;
  v_sanitized_data jsonb;
  v_out_of_preference_ids jsonb := '[]'::jsonb;
  v_has_out_of_preference boolean := false;
  v_now timestamptz := clock_timestamp();
begin
  if auth.uid() is null or not public.is_global_admin() then
    raise exception 'Only global admins can confirm allocations.';
  end if;

  select
    coalesce(jsonb_agg(to_jsonb(passenger ->> 'reservationId')), '[]'::jsonb),
    count(*) > 0
  into v_out_of_preference_ids, v_has_out_of_preference
  from jsonb_array_elements(coalesce(p_allocation_data -> 'passengers', '[]'::jsonb))
    passenger
  left join jsonb_array_elements(coalesce(p_allocation_data -> 'buses', '[]'::jsonb))
    bus on bus ->> 'id' = passenger ->> 'busId'
  where bus is not null
    and not (
      coalesce(passenger -> 'preferences', '[]'::jsonb)
        ? (bus ->> 'destination')
    );

  if v_has_out_of_preference
    and coalesce((p_allocation_data ->> 'allowOutOfPreferenceOverride')::boolean, false)
      is not true then
    raise exception 'Out-of-preference assignments require explicit global-admin acknowledgement.';
  end if;

  v_final_data := p_allocation_data - 'versions';
  if v_has_out_of_preference then
    v_final_data := jsonb_set(
      v_final_data,
      '{outOfPreferenceAcknowledgement}',
      jsonb_build_object(
        'actorId', auth.uid()::text,
        'at', v_now,
        'passengerIds', v_out_of_preference_ids
      ),
      true
    );
    v_final_data := jsonb_set(
      v_final_data,
      '{history}',
      coalesce(v_final_data -> 'history', '[]'::jsonb)
        || jsonb_build_array(
          jsonb_build_object(
            'id', 'history-' || replace(gen_random_uuid()::text, '-', ''),
            'at', v_now,
            'actorId', auth.uid()::text,
            'action', 'out_of_preference_acknowledged',
            'detail',
              jsonb_array_length(v_out_of_preference_ids)::text
                || '명의 1·2지망 외 배정을 확인하고 승인했습니다.'
          )
        ),
      true
    );
  else
    v_final_data := v_final_data - 'outOfPreferenceAcknowledgement';
  end if;

  v_sanitized_data := public.prepare_allocation_preference_override(v_final_data);

  select *
  into v_saved
  from public.save_confirmed_allocation_workspace_v2(
    p_allocation_id,
    p_expected_revision,
    v_sanitized_data,
    p_total_cost,
    p_total_capacity,
    p_version_id,
    p_version_label,
    p_version_changes
  );

  v_final_data := jsonb_set(
    v_final_data,
    '{editLock}',
    coalesce(v_saved.allocation_data -> 'editLock', '{}'::jsonb),
    true
  );

  update public.bus_allocations
  set allocation_data = v_final_data
  where id = p_allocation_id
  returning * into v_saved;

  update public.allocation_workspace_versions
  set snapshot = jsonb_build_object(
    'buses', coalesce(v_final_data -> 'buses', '[]'::jsonb),
    'passengers', coalesce(v_final_data -> 'passengers', '[]'::jsonb)
  )
  where id = p_version_id
    and allocation_id = p_allocation_id;

  return next v_saved;
exception
  when invalid_text_representation then
    raise exception 'Out-of-preference acknowledgement value is invalid.';
end;
$$;

revoke all on function public.validate_allocation_workspace_confirmation_v2(uuid, jsonb)
  from public, anon;
revoke all on function public.save_confirmed_allocation_workspace_v3(
  uuid, bigint, jsonb, integer, integer, text, text, jsonb
) from public, anon;

grant execute on function public.validate_allocation_workspace_confirmation_v2(uuid, jsonb)
  to authenticated;
grant execute on function public.save_confirmed_allocation_workspace_v3(
  uuid, bigint, jsonb, integer, integer, text, text, jsonb
) to authenticated;

notify pgrst, 'reload schema';

