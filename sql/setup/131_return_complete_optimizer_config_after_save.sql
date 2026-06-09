-- Return the complete optimizer configuration after saving editable values.

create or replace function public.save_allocation_optimizer_config(
  p_capacity integer,
  p_price integer,
  p_recommended_minimum_passengers integer
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.assert_allocation_planning_unlocked();
  perform public.save_allocation_optimizer_config_unlocked(
    p_capacity, p_price, p_recommended_minimum_passengers
  );
  return public.get_allocation_optimizer_config();
end;
$$;

revoke all on function public.save_allocation_optimizer_config(
  integer, integer, integer
) from public, anon;
grant execute on function public.save_allocation_optimizer_config(
  integer, integer, integer
) to authenticated;

notify pgrst, 'reload schema';
