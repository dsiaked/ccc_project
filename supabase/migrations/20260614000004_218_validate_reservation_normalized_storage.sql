-- Backfill and validate the expanded reservation storage before read cutover.
-- Legacy compatibility columns remain available in this migration.

update public.reservations
set organization_snapshot = jsonb_strip_nulls(
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
where organization_snapshot is null;

update public.reservations
set extra_data = case
  when jsonb_typeof(extra_data) = 'object' then extra_data - array[
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

  new.extra_data := new.extra_data - array[
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
  ];

  return new;
end;
$$;

drop trigger if exists zy_initialize_reservation_normalized_storage
  on public.reservations;
create trigger zy_initialize_reservation_normalized_storage
before insert or update of organization_snapshot, extra_data
on public.reservations
for each row execute function public.initialize_reservation_normalized_storage();

alter table public.reservations
  add constraint reservations_organization_snapshot_not_null
    check (organization_snapshot is not null) not valid;

alter table public.reservations
  validate constraint reservations_organization_snapshot_not_null;

alter table public.reservations
  alter column organization_snapshot set not null,
  drop constraint reservations_organization_snapshot_not_null,
  drop constraint if exists reservations_extra_data_excludes_canonical_fields,
  add constraint reservations_extra_data_excludes_canonical_fields
    check (
      not (
        extra_data ?| array[
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
      )
    );

notify pgrst, 'reload schema';
