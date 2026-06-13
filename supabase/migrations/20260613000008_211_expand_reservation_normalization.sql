-- Expand reservation storage before removing duplicated compatibility fields.
-- No existing column is removed in this migration.

alter table public.reservations
  add column if not exists organization_snapshot jsonb,
  add column if not exists extra_data jsonb not null default '{}'::jsonb;

alter table public.reservations
  drop constraint if exists reservations_organization_snapshot_object_check,
  add constraint reservations_organization_snapshot_object_check
    check (
      organization_snapshot is null
      or jsonb_typeof(organization_snapshot) = 'object'
    ),
  drop constraint if exists reservations_extra_data_object_check,
  add constraint reservations_extra_data_object_check
    check (jsonb_typeof(extra_data) = 'object');

update public.reservations
set
  organization_snapshot = coalesce(
    organization_snapshot,
    jsonb_strip_nulls(
      jsonb_build_object(
        'affiliationType', affiliation_type,
        'districtId', district_id,
        'district', district,
        'teamId', team_id,
        'team', team,
        'campusId', campus_id,
        'campus', campus,
        'coordinatorName', coordinator_name,
        'coordinatorPhone', coordinator_phone
      )
    )
  ),
  extra_data = case
    when jsonb_typeof(data) = 'object' then data - array[
      'id',
      'name',
      'phone',
      'district',
      'team',
      'campus',
      'affiliationType',
      'coordinatorName',
      'coordinatorPhone',
      'stationPreferences',
      'status',
      'confirmedTicket',
      'boardingConfirmedAt',
      'requestedAt',
      'updatedAt'
    ]
    else '{}'::jsonb
  end;

create or replace function public.initialize_reservation_normalized_storage()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.organization_snapshot is null then
    new.organization_snapshot := jsonb_strip_nulls(
      jsonb_build_object(
        'affiliationType', new.affiliation_type,
        'districtId', new.district_id,
        'district', new.district,
        'teamId', new.team_id,
        'team', new.team,
        'campusId', new.campus_id,
        'campus', new.campus,
        'coordinatorName', new.coordinator_name,
        'coordinatorPhone', new.coordinator_phone
      )
    );
  end if;

  if jsonb_typeof(new.extra_data) is distinct from 'object' then
    new.extra_data := '{}'::jsonb;
  end if;

  return new;
end;
$$;

drop trigger if exists zy_initialize_reservation_normalized_storage
  on public.reservations;
create trigger zy_initialize_reservation_normalized_storage
before insert on public.reservations
for each row execute function public.initialize_reservation_normalized_storage();

comment on column public.reservations.organization_snapshot is
  'Immutable organization labels captured when the reservation is created.';
comment on column public.reservations.extra_data is
  'Extension-only reservation data; canonical reservation fields must use typed columns.';

notify pgrst, 'reload schema';
