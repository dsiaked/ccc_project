-- Reattribute existing personal simulation activity after the simulation actor
-- trigger has been installed.

with simulation_users as (
  select simulation_user.id
  from auth.users simulation_user
  where lower(coalesce(simulation_user.email, '')) like '%@ccc-bus.test'
    and simulation_user.raw_user_meta_data ? 'sim_seq'
),
simulation_resources as (
  select 'profiles'::text as resource_type, profile.id as resource_id, profile.id as actor_id
  from public.profiles profile
  join simulation_users simulation_user on simulation_user.id = profile.id
  union all
  select 'reservations', reservation.id, reservation.user_id
  from public.reservations reservation
  join simulation_users simulation_user on simulation_user.id = reservation.user_id
  union all
  select 'payments', payment.id, payment.user_id
  from public.payments payment
  join simulation_users simulation_user on simulation_user.id = payment.user_id
)
update public.activity_event_logs activity
set actor_id = resource.actor_id,
    actor_kind = 'user',
    metadata = activity.metadata || jsonb_build_object('source', 'simulation')
from simulation_resources resource
where activity.metadata ->> 'resource_type' = resource.resource_type
  and activity.metadata ->> 'resource_id' = resource.resource_id::text;
