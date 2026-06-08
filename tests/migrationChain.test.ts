import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import test from 'node:test';

const migrationDirectory = 'supabase/migrations';
const migrationFiles = readdirSync(migrationDirectory)
  .filter((file) => file.endsWith('.sql'))
  .sort();
const migrationSql = migrationFiles
  .map((file) => readFileSync(`${migrationDirectory}/${file}`, 'utf8'))
  .join('\n');

test('migration chain starts with the required foundation schema', () => {
  assert.equal(
    migrationFiles[0],
    '20260607180000_initial_foundation.sql',
    'The foundation migration must run before feature migrations.'
  );

  const foundation = readFileSync(
    `${migrationDirectory}/20260607180000_initial_foundation.sql`,
    'utf8'
  );

  assert.doesNotMatch(foundation, /�/u);
  assert.match(foundation, /district text default '서울지구'/u);

  for (const table of [
    'reservations',
    'payments',
    'admin_roles',
    'bus_options',
    'bus_allocations',
    'profiles',
    'stations',
    'campus_requests',
    'home_announcements',
  ]) {
    assert.match(
      foundation,
      new RegExp(`create table if not exists (public\\.)?${table}\\b`, 'i'),
      `Foundation migration must create ${table}.`
    );
  }
});

test('migration files preserve valid UTF-8 text', () => {
  for (const file of migrationFiles) {
    const sql = readFileSync(`${migrationDirectory}/${file}`, 'utf8');
    assert.doesNotMatch(sql, /�/u, `${file} contains invalid UTF-8 text.`);
  }
});

test('migration chain contains RPCs required by high-risk administrator flows', () => {
  for (const functionName of [
    'reset_reservation_data',
    'get_confirmed_allocation_summaries',
    'get_admin_personal_ticket_page',
    'get_campus_admin_manage_users_page',
    'create_bus_allocation_as_global_admin',
    'create_allocation_optimization_job',
    'create_allocation_draft_from_optimal_job',
    'validate_allocation_workspace_confirmation_v2',
    'save_confirmed_allocation_workspace_v3',
    'get_boarding_management_snapshot',
    'set_passenger_boarding_status',
    'update_passenger_boarding_note',
    'mark_boarding_bus_departed',
    'cancel_boarding_bus_departure',
    'create_campus_request_with_message',
    'update_campus_request_status_with_response',
    'mark_campus_request_read',
    'get_unread_campus_request_ids',
    'has_admin_permission',
    'is_campus_admin_for_scope',
    'get_boarding_manager_assignment_options',
    'set_boarding_manager_bus_assignments_as_global_admin',
    'can_manage_boarding_bus',
    'rotate_boarding_check_in_code',
    'submit_boarding_check_in_code',
    'upsert_campus_payment_account_as_admin',
    'cancel_campus_transfer_report',
  ]) {
    assert.match(
      migrationSql,
      new RegExp(
        `create or replace function (public\\.)?${functionName}\\b`,
        'i'
      ),
      `Migration chain must define ${functionName}.`
    );
  }
});

test('campus administrator paging setup SQL matches its migration', () => {
  const setupSql = readFileSync(
    'sql/setup/75_campus_admin_manage_users_page.sql',
    'utf8'
  ).replaceAll('\r\n', '\n');
  const migration = readFileSync(
    `${migrationDirectory}/20260608070001_75_campus_admin_manage_users_page.sql`,
    'utf8'
  ).replaceAll('\r\n', '\n');

  assert.equal(migration, setupSql);
});

for (const [setupFile, migrationFile] of [
  [
    '70_admin_personal_ticket_page.sql',
    '20260608010001_70_admin_personal_ticket_page.sql',
  ],
  [
    '71_admin_setup_rpc_only_writes.sql',
    '20260608020001_71_admin_setup_rpc_only_writes.sql',
  ],
  [
    '72_app_settings_announcements_rpc_only.sql',
    '20260608030001_72_app_settings_announcements_rpc_only.sql',
  ],
  [
    '73_campus_transfers_rpc_only_writes.sql',
    '20260608040001_73_campus_transfers_rpc_only_writes.sql',
  ],
  [
    '74_bus_allocations_rpc_only_writes.sql',
    '20260608050001_74_bus_allocations_rpc_only_writes.sql',
  ],
  [
    '76_exact_allocation_optimization_jobs.sql',
    '20260608080001_76_exact_allocation_optimization_jobs.sql',
  ],
  [
    '77_create_draft_from_exact_optimization.sql',
    '20260608090001_77_create_draft_from_exact_optimization.sql',
  ],
  [
    '78_out_of_preference_admin_override.sql',
    '20260608100001_78_out_of_preference_admin_override.sql',
  ],
  [
    '79_single_bus_option.sql',
    '20260608110001_79_single_bus_option.sql',
  ],
  [
    '80_notice_audience_and_lifecycle.sql',
    '20260608120001_80_notice_audience_and_lifecycle.sql',
  ],
  [
    '80_remaining_seat_payment_workflow.sql',
    '20260608120002_80_remaining_seat_payment_workflow.sql',
  ],
  [
    '80_detailed_allocation_optimization_jobs.sql',
    '20260608130001_80_detailed_allocation_optimization_jobs.sql',
  ],
  [
    '81_immediate_allocation_job_cancel.sql',
    '20260608140001_81_immediate_allocation_job_cancel.sql',
  ],
  [
    '84_instant_allocation_result_reuse.sql',
    '20260608150001_84_instant_allocation_result_reuse.sql',
  ],
  [
    '85_passenger_boarding_confirmation.sql',
    '20260608160001_85_passenger_boarding_confirmation.sql',
  ],
  [
    '85_allocation_result_reuse_status.sql',
    '20260608160002_85_allocation_result_reuse_status.sql',
  ],
  [
    '86_detailed_allocation_resume_and_skip.sql',
    '20260608170001_86_detailed_allocation_resume_and_skip.sql',
  ],
  [
    '87_boarding_management.sql',
    '20260608180001_87_boarding_management.sql',
  ],
  [
    '88_allocation_requires_closed_deadline.sql',
    '20260608190001_88_allocation_requires_closed_deadline.sql',
  ],
  [
    '89_allocation_execution_mode.sql',
    '20260608200001_89_allocation_execution_mode.sql',
  ],
  [
    '91_atomic_campus_request_workflow.sql',
    '20260608220001_91_atomic_campus_request_workflow.sql',
  ],
  [
    '92_admin_created_account_source.sql',
    '20260608230001_92_admin_created_account_source.sql',
  ],
  [
    '92_campus_request_read_and_audit.sql',
    '20260608230002_92_campus_request_read_and_audit.sql',
  ],
  [
    '93_reset_allocation_optimization_jobs.sql',
    '20260609000001_93_reset_allocation_optimization_jobs.sql',
  ],
  [
    '94_boarding_notes.sql',
    '20260609010001_94_boarding_notes.sql',
  ],
  [
    '95_admin_permission_and_audit.sql',
    '20260609020001_95_admin_permission_and_audit.sql',
  ],
  [
    '96_boarding_manager_bus_assignments.sql',
    '20260609030001_96_boarding_manager_bus_assignments.sql',
  ],
  [
    '97_campus_payment_accounts.sql',
    '20260609040001_97_campus_payment_accounts.sql',
  ],
  [
    '98_boarding_check_in_codes.sql',
    '20260609050001_98_boarding_check_in_codes.sql',
  ],
  [
    '99_external_participants.sql',
    '20260609060001_99_external_participants.sql',
  ],
  [
    '100_four_digit_boarding_check_in_codes.sql',
    '20260609070001_100_four_digit_boarding_check_in_codes.sql',
  ],
  [
    '101_disable_public_email_exists.sql',
    '20260609080001_101_disable_public_email_exists.sql',
  ],
  [
    '102_invalidate_optimization_cache_on_reservation_changes.sql',
    '20260609090001_102_invalidate_optimization_cache_on_reservation_changes.sql',
  ],
  [
    '103_show_reservation_changes_on_optimization_jobs.sql',
    '20260609100001_103_show_reservation_changes_on_optimization_jobs.sql',
  ],
  [
    '104_remaining_seat_allocation_passenger_source.sql',
    '20260609110001_104_remaining_seat_allocation_passenger_source.sql',
  ],
  [
    '105_lock_allocation_planning_while_confirmed.sql',
    '20260609120001_105_lock_allocation_planning_while_confirmed.sql',
  ],
  [
    '106_canonical_boarding_bus_id.sql',
    '20260609130001_106_canonical_boarding_bus_id.sql',
  ],
  [
    '107_fix_confirmed_allocation_name.sql',
    '20260609140001_107_fix_confirmed_allocation_name.sql',
  ],
  [
    '108_enforce_optimizer_maximum_bus_count.sql',
    '20260609150001_108_enforce_optimizer_maximum_bus_count.sql',
  ],
  [
    '109_canonical_reservation_data.sql',
    '20260609160001_109_canonical_reservation_data.sql',
  ],
  [
    '110_canonical_reservation_organization_scope.sql',
    '20260609170001_110_canonical_reservation_organization_scope.sql',
  ],
  [
    '111_classify_automatic_boarding_events.sql',
    '20260609180001_111_classify_automatic_boarding_events.sql',
  ],
  [
    '112_canonical_profile_organization_scope.sql',
    '20260609190001_112_canonical_profile_organization_scope.sql',
  ],
  [
    '113_canonical_admin_role_organization_scope.sql',
    '20260609200001_113_canonical_admin_role_organization_scope.sql',
  ],
  [
    '114_allow_allocation_workspace_lock_before_deadline.sql',
    '20260609210001_114_allow_allocation_workspace_lock_before_deadline.sql',
  ],
  [
    '115_canonical_campus_request_organization_scope.sql',
    '20260609220001_115_canonical_campus_request_organization_scope.sql',
  ],
  [
    '116_campus_admin_payment_account.sql',
    '20260609230001_116_campus_admin_payment_account.sql',
  ],
  [
    '117_cancel_campus_transfer_report.sql',
    '20260610000001_117_cancel_campus_transfer_report.sql',
  ],
  [
    '118_prioritize_campus_admin_in_search.sql',
    '20260610010001_118_prioritize_campus_admin_in_search.sql',
  ],
  [
    '119_allow_confirmation_transaction_cleanup.sql',
    '20260610020001_119_allow_confirmation_transaction_cleanup.sql',
  ],
  [
    '120_search_all_users_for_campus_admin.sql',
    '20260610030001_120_search_all_users_for_campus_admin.sql',
  ],
  [
    '121_fix_campus_payment_account_campus_id_ambiguity.sql',
    '20260610040001_121_fix_campus_payment_account_campus_id_ambiguity.sql',
  ],
]) {
  test(`${setupFile} matches its migration`, () => {
    const setupSql = readFileSync(`sql/setup/${setupFile}`, 'utf8').replaceAll(
      '\r\n',
      '\n'
    );
    const migration = readFileSync(
      `${migrationDirectory}/${migrationFile}`,
      'utf8'
    ).replaceAll('\r\n', '\n');

    assert.equal(migration, setupSql);
  });
}

test('allocation writes require the reservation deadline to be closed', () => {
  const migration = readFileSync(
    `${migrationDirectory}/20260608190001_88_allocation_requires_closed_deadline.sql`,
    'utf8'
  );

  assert.match(
    migration,
    /before insert on public\.allocation_optimization_jobs/i
  );
  assert.match(migration, /before insert or update on public\.bus_allocations/i);
  assert.match(
    migration,
    /v_deadline_at is null or v_deadline_at > clock_timestamp\(\)/i
  );
});

test('allocation workspace locks can be acquired before the reservation deadline', () => {
  const migration = readFileSync(
    `${migrationDirectory}/20260609210001_114_allow_allocation_workspace_lock_before_deadline.sql`,
    'utf8'
  );

  assert.match(
    migration,
    /to_jsonb\(new\) - 'allocation_data' - 'updated_at' - 'revision'/i
  );
  assert.match(
    migration,
    /\(new\.allocation_data - 'editLock'\) = \(old\.allocation_data - 'editLock'\)/i
  );
  assert.match(migration, /new\.revision = old\.revision \+ 1/i);
  assert.match(
    migration,
    /v_deadline_at is null or v_deadline_at > clock_timestamp\(\)/i
  );
});

test('boarding managers are limited to their assigned buses', () => {
  const migration = readFileSync(
    `${migrationDirectory}/20260609030001_96_boarding_manager_bus_assignments.sql`,
    'utf8'
  );

  assert.match(migration, /create table if not exists public\.boarding_manager_bus_assignments/i);
  assert.match(migration, /unique \(allocation_id, manager_user_id, bus_id\)/i);
  assert.match(
    migration,
    /create or replace function public\.set_boarding_manager_bus_assignments_as_global_admin/i
  );
  assert.match(
    migration,
    /where public\.can_manage_boarding_bus\(v_allocation\.id, bus ->> 'id'\)/i
  );
  assert.match(
    migration,
    /public\.can_manage_boarding_bus_label\([\s\S]*reservation\.confirmed_ticket ->> 'busNumber'/i
  );
  assert.match(
    migration,
    /create policy "Boarding managers can view reservations"[\s\S]*public\.can_manage_current_boarding_bus_label/i
  );
});

test('passenger boarding check-in requires a bus-specific code', () => {
  const migration = readFileSync(
    `${migrationDirectory}/20260609050001_98_boarding_check_in_codes.sql`,
    'utf8'
  );

  assert.match(migration, /check_in_code text not null/i);
  assert.match(migration, /v_code !~ '\^\[0-9\]\{4\}\$'/i);
  assert.match(
    migration,
    /revoke all on function public\.confirm_my_boarding\(\) from public, anon, authenticated/i
  );
});

test('browser clients cannot enumerate registered email addresses', () => {
  const migration = readFileSync(
    `${migrationDirectory}/20260609080001_101_disable_public_email_exists.sql`,
    'utf8'
  );

  assert.match(
    migration,
    /revoke all on function public\.email_exists\(text\) from anon, authenticated/i
  );
  assert.match(
    migration,
    /create trigger validate_profile_organization_membership[\s\S]*before insert or update of affiliation_type, district_id, team_id, campus_id/i
  );
});

test('cancelled reservations can reclaim a remaining seat', () => {
  const migration = readFileSync(
    `${migrationDirectory}/20260608210001_90_cancelled_remaining_seat_reclaim.sql`,
    'utf8'
  );

  assert.match(migration, /status <> 'cancelled'/i);
  assert.match(
    migration,
    /v_existing_reservation_status <> 'cancelled'/i
  );
  assert.match(migration, /on conflict \(id\) do update set/i);
  assert.match(
    migration,
    /delete from public\.payments where reservation_id = v_reservation_id/i
  );
});

test('active reservation changes invalidate reusable optimization results', () => {
  const migration = readFileSync(
    `${migrationDirectory}/20260609090001_102_invalidate_optimization_cache_on_reservation_changes.sql`,
    'utf8'
  );

  assert.match(
    migration,
    /create or replace function public\.create_uncached_allocation_optimization_job/i
  );
  assert.match(migration, /'active_reservations_hash', v_active_reservations_hash/i);
  assert.match(migration, /'active_reservation_count', v_active_reservation_count/i);
  assert.match(
    migration,
    /and not coalesce\(reservation\.data \? 'remainingSeatClaim', false\)/i
  );
});

test('optimization job reads expose reservation changes', () => {
  const migration = readFileSync(
    `${migrationDirectory}/20260609100001_103_show_reservation_changes_on_optimization_jobs.sql`,
    'utf8'
  );

  assert.match(migration, /reservations_changed boolean/i);
  assert.match(migration, /snapshot_active_reservation_count integer/i);
  assert.match(migration, /current_active_reservation_count integer/i);
  assert.match(
    migration,
    /job\.input_snapshot ->> 'active_reservations_hash'[\s\S]*v_current_state ->> 'hash'/i
  );
});

test('remaining-seat passengers keep their allocation source and status', () => {
  const migration = readFileSync(
    `${migrationDirectory}/20260609110001_104_remaining_seat_allocation_passenger_source.sql`,
    'utf8'
  );

  assert.match(
    migration,
    /create trigger normalize_allocation_remaining_seat_passengers/i
  );
  assert.match(migration, /'source', 'remaining_seat'/i);
  assert.match(migration, /'remainingSeatStatus'/i);
  assert.match(migration, /reservation\.data \? 'remainingSeatClaim'/i);
});

test('confirmed allocations lock all allocation planning writes', () => {
  const migration = readFileSync(
    `${migrationDirectory}/20260609120001_105_lock_allocation_planning_while_confirmed.sql`,
    'utf8'
  );

  assert.match(
    migration,
    /before insert or update or delete on public\.bus_allocations/i
  );
  assert.match(
    migration,
    /before insert on public\.allocation_optimization_jobs/i
  );
  assert.match(
    migration,
    /Confirmed allocation is locked until confirmation is cancelled\./i
  );
  assert.match(
    migration,
    /rename to save_confirmed_allocation_workspace_v3_unlocked/i
  );
  assert.match(
    migration,
    /rename to save_allocation_optimizer_config_unlocked/i
  );
  assert.match(
    migration,
    /tg_op = 'UPDATE' and old\.allocation_data ->> 'status' = 'confirmed'/i
  );
  assert.match(
    migration,
    /current_setting\('app\.allocation_confirmation_write', true\) = 'on'/i
  );
  assert.match(
    migration,
    /set_config\('app\.allocation_confirmation_write', 'on', true\)/i
  );
});

test('confirmation transactions can clean up stale allocation drafts', () => {
  const migration = readFileSync(
    `${migrationDirectory}/20260610020001_119_allow_confirmation_transaction_cleanup.sql`,
    'utf8'
  );

  assert.match(
    migration,
    /current_setting\('app\.allocation_confirmation_write', true\) = 'on'[\s\S]*tg_op = 'DELETE'[\s\S]*return old/i
  );
  assert.match(
    migration,
    /set_config\('app\.allocation_confirmation_write', 'on', true\)[\s\S]*save_confirmed_allocation_workspace_v3_unlocked/i
  );
});

test('confirmed allocation names are fixed to the canonical label', () => {
  const migration = readFileSync(
    `${migrationDirectory}/20260609140001_107_fix_confirmed_allocation_name.sql`,
    'utf8'
  );

  assert.match(migration, /new\.allocation_name := '확정 배차안'/i);
  assert.match(
    migration,
    /before insert or update of allocation_name, allocation_data/i
  );
  assert.match(
    migration,
    /update public\.bus_allocations[\s\S]*set allocation_name = '확정 배차안'/i
  );
});

test('boarding authorization and check-in use canonical bus IDs', () => {
  const migration = readFileSync(
    `${migrationDirectory}/20260609130001_106_canonical_boarding_bus_id.sql`,
    'utf8'
  );

  assert.match(migration, /create trigger validate_allocation_bus_identifiers/i);
  assert.match(migration, /Duplicate bus IDs exist in the allocation\./i);
  assert.match(migration, /Duplicate bus labels exist in the allocation\./i);
  assert.match(migration, /create or replace function public\.get_confirmed_ticket_bus_id/i);
  assert.match(migration, /'\{busId\}'/i);
  assert.match(
    migration,
    /public\.can_manage_boarding_bus\(\s*allocation\.id,\s*public\.get_confirmed_ticket_bus_id/i
  );
  assert.match(migration, /and departure\.bus_id = v_bus_id/i);
  assert.match(migration, /and bus_id = v_bus_id[\s\S]*and check_in_code = v_code/i);
});

test('new optimization snapshots include the configured maximum bus count', () => {
  const migration = readFileSync(
    `${migrationDirectory}/20260609150001_108_enforce_optimizer_maximum_bus_count.sql`,
    'utf8'
  );
  const optimizerSchema = readFileSync(
    'optimizer/exact_optimizer/schema.py',
    'utf8'
  );
  const optimizerModel = readFileSync(
    'optimizer/exact_optimizer/model.py',
    'utf8'
  );

  assert.match(migration, /select max_count[\s\S]*from public\.bus_options/i);
  assert.match(migration, /'\{maximum_buses\}'/i);
  assert.match(optimizerSchema, /maximum_buses: int \| None = None/i);
  assert.match(
    optimizerModel,
    /_sum\(buses_by_destination\.values\(\)\) <= data\.bus\.maximum_buses/i
  );
});

test('reservation columns are canonical and data remains a compatibility snapshot', () => {
  const migration = readFileSync(
    `${migrationDirectory}/20260609160001_109_canonical_reservation_data.sql`,
    'utf8'
  );
  const reservationService = readFileSync(
    'src/lib/reservationService.ts',
    'utf8'
  );

  assert.match(
    migration,
    /when jsonb_typeof\(new\.data\) = 'object' then new\.data[\s\S]*\|\| jsonb_build_object/i
  );
  assert.match(
    migration,
    /'stationPreferences', coalesce\(new\.station_preferences/i
  );
  assert.match(migration, /'confirmedTicket', new\.confirmed_ticket/i);
  assert.match(migration, /before insert or update on public\.reservations/i);
  assert.match(
    reservationService,
    /id: data\.id,[\s\S]*name: data\.name,[\s\S]*stationPreferences: data\.station_preferences/i
  );
});

test('Seoul reservation organization names and parent IDs derive from campus_id', () => {
  const migration = readFileSync(
    `${migrationDirectory}/20260609170001_110_canonical_reservation_organization_scope.sql`,
    'utf8'
  );

  assert.match(
    migration,
    /where campus\.id = new\.campus_id[\s\S]*Seoul reservations require a valid campus_id\./i
  );
  assert.match(
    migration,
    /if new\.affiliation_type = 'external'[\s\S]*new\.campus_id := null/i
  );
  assert.match(
    migration,
    /foreign key \(campus_id\) references public\.campuses\(id\)/i
  );
  assert.match(
    migration,
    /after update of name, team_id on public\.campuses/i
  );
  assert.match(
    migration,
    /create trigger sync_reservation_organization_scope[\s\S]*before insert or update of/i
  );
});

test('scoped Seoul profile organization names and parent IDs derive from campus_id', () => {
  const migration = readFileSync(
    `${migrationDirectory}/20260609190001_112_canonical_profile_organization_scope.sql`,
    'utf8'
  );

  assert.match(
    migration,
    /where campus\.id = new\.campus_id[\s\S]*Scoped Seoul profiles require a valid campus_id\./i
  );
  assert.match(
    migration,
    /if new\.affiliation_type = 'external'[\s\S]*new\.campus_id := null/i
  );
  assert.match(
    migration,
    /new\.district_id is null[\s\S]*new\.campus_id is null[\s\S]*return new/i
  );
  assert.match(
    migration,
    /foreign key \(campus_id\) references public\.campuses\(id\)/i
  );
  assert.match(
    migration,
    /drop trigger if exists validate_profile_organization_membership/i
  );
  assert.match(
    migration,
    /after update of name, team_id on public\.campuses/i
  );
});

test('campus admin role scope derives from campus_id and unscoped roles stay empty', () => {
  const migration = readFileSync(
    `${migrationDirectory}/20260609200001_113_canonical_admin_role_organization_scope.sql`,
    'utf8'
  );

  assert.match(
    migration,
    /if new\.role <> 'campus_admin'[\s\S]*new\.campus_id := null/i
  );
  assert.match(
    migration,
    /where campus\.id = new\.campus_id[\s\S]*Campus admin roles require a valid campus_id\./i
  );
  assert.match(
    migration,
    /drop trigger if exists set_admin_role_scope_ids/i
  );
  assert.match(
    migration,
    /create unique index if not exists idx_admin_roles_campus_id_scope_unique[\s\S]*on public\.admin_roles\(role, campus_id\)/i
  );
  assert.match(
    migration,
    /create trigger sync_admin_role_organization_scope[\s\S]*before insert or update of/i
  );
  assert.match(
    migration,
    /after update of name, team_id on public\.campuses/i
  );
});

test('campus request scope derives from campus_id while global notices stay unscoped', () => {
  const migration = readFileSync(
    `${migrationDirectory}/20260609220001_115_canonical_campus_request_organization_scope.sql`,
    'utf8'
  );

  assert.match(
    migration,
    /if new\.is_global_notice[\s\S]*new\.campus_id := null[\s\S]*new\.campus := ''/i
  );
  assert.match(
    migration,
    /where campus\.id = new\.campus_id[\s\S]*Campus requests require a valid campus_id\./i
  );
  assert.match(migration, /drop trigger if exists set_campus_request_scope_ids/i);
  assert.match(
    migration,
    /create trigger sync_campus_request_organization_scope[\s\S]*before insert or update of/i
  );
  assert.match(
    migration,
    /after update of name, team_id on public\.campuses/i
  );
});

test('campus request creation and responses are atomic', () => {
  const migration = readFileSync(
    `${migrationDirectory}/20260608220001_91_atomic_campus_request_workflow.sql`,
    'utf8'
  );

  assert.match(
    migration,
    /create or replace function public\.create_campus_request_with_message[\s\S]*insert into public\.campus_requests[\s\S]*insert into public\.campus_request_messages/i
  );
  assert.match(
    migration,
    /create or replace function public\.update_campus_request_status_with_response[\s\S]*update public\.campus_requests[\s\S]*insert into public\.campus_request_messages/i
  );
  assert.match(migration, /v_actor_id uuid := auth\.uid\(\)/i);
  assert.match(
    migration,
    /A global administrator response is required before resolving a request/i
  );
});

test('combined setup includes the latest campus request workflow', () => {
  const combined = readFileSync(
    'sql/setup/combined_supabase_setup.sql',
    'utf8'
  );

  const orderedMarkers = [
    'BEGIN sql/setup/71_admin_setup_rpc_only_writes.sql',
    'BEGIN sql/setup/72_app_settings_announcements_rpc_only.sql',
    'BEGIN sql/setup/73_campus_transfers_rpc_only_writes.sql',
    'BEGIN sql/setup/74_bus_allocations_rpc_only_writes.sql',
    'BEGIN sql/setup/75_campus_admin_manage_users_page.sql',
    'BEGIN sql/setup/76_exact_allocation_optimization_jobs.sql',
    'BEGIN sql/setup/77_create_draft_from_exact_optimization.sql',
    'BEGIN sql/setup/78_out_of_preference_admin_override.sql',
    'BEGIN sql/setup/79_single_bus_option.sql',
    'BEGIN sql/setup/80_notice_audience_and_lifecycle.sql',
    'BEGIN sql/setup/80_remaining_seat_payment_workflow.sql',
    'BEGIN sql/setup/80_detailed_allocation_optimization_jobs.sql',
    'BEGIN sql/setup/81_immediate_allocation_job_cancel.sql',
    'BEGIN sql/setup/84_instant_allocation_result_reuse.sql',
    'BEGIN sql/setup/85_passenger_boarding_confirmation.sql',
    'BEGIN sql/setup/85_allocation_result_reuse_status.sql',
    'BEGIN sql/setup/86_detailed_allocation_resume_and_skip.sql',
    'BEGIN sql/setup/87_boarding_management.sql',
    'BEGIN sql/setup/88_allocation_requires_closed_deadline.sql',
    'BEGIN sql/setup/89_allocation_execution_mode.sql',
    'BEGIN sql/setup/91_atomic_campus_request_workflow.sql',
    'BEGIN sql/setup/92_admin_created_account_source.sql',
    'BEGIN sql/setup/92_campus_request_read_and_audit.sql',
    'BEGIN sql/setup/93_reset_allocation_optimization_jobs.sql',
    'BEGIN sql/setup/94_boarding_notes.sql',
    'BEGIN sql/setup/95_admin_permission_and_audit.sql',
    'BEGIN sql/setup/96_boarding_manager_bus_assignments.sql',
    'BEGIN sql/setup/97_campus_payment_accounts.sql',
    'BEGIN sql/setup/98_boarding_check_in_codes.sql',
    'BEGIN sql/setup/99_external_participants.sql',
    'BEGIN sql/setup/100_four_digit_boarding_check_in_codes.sql',
    'BEGIN sql/setup/101_disable_public_email_exists.sql',
    'BEGIN sql/setup/102_invalidate_optimization_cache_on_reservation_changes.sql',
    'BEGIN sql/setup/103_show_reservation_changes_on_optimization_jobs.sql',
    'BEGIN sql/setup/104_remaining_seat_allocation_passenger_source.sql',
    'BEGIN sql/setup/105_lock_allocation_planning_while_confirmed.sql',
    'BEGIN sql/setup/106_canonical_boarding_bus_id.sql',
    'BEGIN sql/setup/107_fix_confirmed_allocation_name.sql',
    'BEGIN sql/setup/108_enforce_optimizer_maximum_bus_count.sql',
    'BEGIN sql/setup/109_canonical_reservation_data.sql',
    'BEGIN sql/setup/110_canonical_reservation_organization_scope.sql',
    'BEGIN sql/setup/111_classify_automatic_boarding_events.sql',
    'BEGIN sql/setup/112_canonical_profile_organization_scope.sql',
    'BEGIN sql/setup/113_canonical_admin_role_organization_scope.sql',
    'BEGIN sql/setup/114_allow_allocation_workspace_lock_before_deadline.sql',
    'BEGIN sql/setup/115_canonical_campus_request_organization_scope.sql',
    'BEGIN sql/setup/116_campus_admin_payment_account.sql',
    'BEGIN sql/setup/117_cancel_campus_transfer_report.sql',
    'BEGIN sql/setup/118_prioritize_campus_admin_in_search.sql',
    'BEGIN sql/setup/119_allow_confirmation_transaction_cleanup.sql',
    'BEGIN sql/setup/120_search_all_users_for_campus_admin.sql',
    'BEGIN sql/setup/121_fix_campus_payment_account_campus_id_ambiguity.sql',
  ];
  let previousMarkerIndex = -1;
  for (const marker of orderedMarkers) {
    const markerIndex = combined.indexOf(marker);
    assert.notEqual(markerIndex, -1, `${marker} is missing`);
    assert.ok(
      markerIndex > previousMarkerIndex,
      `${marker} is out of execution order`
    );
    previousMarkerIndex = markerIndex;
  }

  assert.match(combined, /create table if not exists public\.campus_notice_targets/i);
  assert.match(combined, /create table if not exists public\.campus_request_reads/i);
  assert.match(combined, /create table if not exists public\.campus_request_audit_logs/i);
  assert.match(combined, /create table if not exists public\.admin_action_audit_logs/i);
  assert.match(combined, /create table if not exists public\.campus_payment_accounts/i);
  assert.match(combined, /create table if not exists public\.boarding_check_in_codes/i);
  assert.match(combined, /affiliation_type text not null default 'seoul'/i);
  assert.match(
    combined,
    /check \(role in \('campus_admin', 'global_admin', 'boarding_manager'\)\)/i
  );
  for (const functionName of [
    'assign_boarding_manager_as_global_admin',
    'create_allocation_optimization_job_for_execution',
    'create_detailed_allocation_optimization_job_for_execution',
    'reset_allocation_optimization_jobs',
    'get_available_remaining_seats',
  ]) {
    assert.match(
      combined,
      new RegExp(`function public\\.${functionName}`, 'i')
    );
  }
});

test('combined setup includes every managed setup patch', () => {
  const combined = readFileSync('sql/setup/combined_supabase_setup.sql', 'utf8');
  const intentionallyUnmanaged = new Set([
    '80_seed_seoul_organization.sql',
    '81_cleanup_unused_seoul_organization.sql',
    '82_seed_stations_template.sql',
    '83_add_dong_team_campuses.sql',
    '99_finalize_setup.sql',
  ]);

  const managedPatchFiles = readdirSync('sql/setup')
    .filter((fileName) => {
      const sequence = Number.parseInt(fileName.match(/^(\d+)_/)?.[1] ?? '', 10);
      return (
        fileName.endsWith('.sql') &&
        sequence >= 70 &&
        !intentionallyUnmanaged.has(fileName)
      );
    })
    .sort();

  for (const setupFile of managedPatchFiles) {
    assert.ok(
      combined.includes(`BEGIN sql/setup/${setupFile}`),
      `${setupFile} is missing from combined setup`
    );
  }
});

test('combined setup defines every statically called application RPC', () => {
  const combined = readFileSync('sql/setup/combined_supabase_setup.sql', 'utf8');
  const sourceFiles: string[] = [];
  const collectSourceFiles = (directory: string) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = `${directory}/${entry.name}`;
      if (entry.isDirectory()) {
        collectSourceFiles(path);
      } else if (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx')) {
        sourceFiles.push(path);
      }
    }
  };

  collectSourceFiles('src');
  collectSourceFiles('supabase/functions');

  const rpcNames = new Set<string>();
  const rpcPattern = /\.rpc\(\s*['"]([^'"]+)['"]/g;
  for (const sourceFile of sourceFiles) {
    const source = readFileSync(sourceFile, 'utf8');
    for (const match of source.matchAll(rpcPattern)) {
      rpcNames.add(match[1]);
    }
  }

  for (const rpcName of [...rpcNames].sort()) {
    const escapedName = rpcName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    assert.match(
      combined,
      new RegExp(`function\\s+(?:public\\.)?${escapedName}\\s*\\(`, 'i'),
      `${rpcName} is called by the application but missing from combined setup`
    );
  }
});

test('global administrators inherit scoped server permissions and operations are audited', () => {
  const migration = readFileSync(
    `${migrationDirectory}/20260609020001_95_admin_permission_and_audit.sql`,
    'utf8'
  );

  assert.match(
    migration,
    /admin_role\.role = 'global_admin'[\s\S]*admin_role\.role = p_required_role/i
  );
  assert.match(migration, /create trigger audit_admin_payment_operation/i);
  assert.match(
    migration,
    /create trigger audit_admin_campus_transfer_operation/i
  );
  assert.match(
    migration,
    /from public\.admin_roles admin_role\s+where admin_role\.user_id = auth\.uid\(\)/i
  );
});

test('automatic boarding events remain classified as automatic', () => {
  const migration = readFileSync(
    `${migrationDirectory}/20260609180001_111_classify_automatic_boarding_events.sql`,
    'utf8'
  );
  const boardingPage = readFileSync(
    'src/pages/admin/AdminBoardingPage.tsx',
    'utf8'
  );

  assert.match(
    migration,
    /event\.note = 'bus_departed_auto_no_show'[\s\S]*then 'automatic'/i
  );
  assert.match(
    migration,
    /public\.can_manage_boarding_reservation\(reservation\.id\)/i
  );
  assert.match(boardingPage, /event\.note === 'bus_departed_auto_no_show'/i);
});

test('admin-created accounts have an explicit source marker', () => {
  const migration = readFileSync(
    `${migrationDirectory}/20260608230001_92_admin_created_account_source.sql`,
    'utf8'
  );
  const edgeFunction = readFileSync(
    'supabase/functions/admin-user-manager/index.ts',
    'utf8'
  );

  assert.match(migration, /account_source text not null default 'self_signup'/i);
  assert.match(edgeFunction, /account_source: 'admin_created'/i);
});

test('external participants use the normal reservation flow with global-admin payment review', () => {
  const migration = readFileSync(
    `${migrationDirectory}/20260609060001_99_external_participants.sql`,
    'utf8'
  );
  const edgeFunction = readFileSync(
    'supabase/functions/admin-user-manager/index.ts',
    'utf8'
  );

  assert.match(migration, /affiliation_type in \('seoul', 'external'\)/i);
  assert.match(
    migration,
    /v_affiliation_type = 'external'[\s\S]*v_coordinator_name is null or v_coordinator_phone is null/i
  );
  assert.match(
    migration,
    /where target\.status in \('requested', 'cancelled'\)/i
  );
  assert.match(migration, /create trigger prevent_locked_affiliation_change/i);
  assert.match(
    migration,
    /create trigger enforce_external_payment_global_admin/i
  );
  assert.match(edgeFunction, /organizationMode === 'external'/i);
  assert.match(edgeFunction, /affiliation_type: 'external'/i);
  assert.match(edgeFunction, /coordinator_name: coordinatorName/i);
});

test('personal ticket summary includes completed payment people', () => {
  const migration = readFileSync(
    `${migrationDirectory}/20260608010001_70_admin_personal_ticket_page.sql`,
    'utf8'
  );

  assert.match(
    migration,
    /payment_status = 'completed'[\s\S]*as paid/i
  );
});

test('campus transfer reports can be cancelled only before head-office confirmation', () => {
  const migration = readFileSync(
    `${migrationDirectory}/20260610000001_117_cancel_campus_transfer_report.sql`,
    'utf8'
  );

  assert.match(migration, /if v_transfer\.status <> 'sent'/i);
  assert.match(
    migration,
    /admin_role\.role = 'campus_admin'[\s\S]*admin_role\.campus_id = v_transfer\.campus_id/i
  );
  assert.match(
    migration,
    /delete from public\.campus_transfers[\s\S]*status = 'sent'/i
  );
});

test('campus administrator search prioritizes the selected campus administrator before paging', () => {
  const migration = readFileSync(
    `${migrationDirectory}/20260610010001_118_prioritize_campus_admin_in_search.sql`,
    'utf8'
  );

  assert.match(
    migration,
    /matching_role\.role = 'campus_admin'[\s\S]*then 0[\s\S]*else 1[\s\S]*end as campus_admin_priority/i
  );
  assert.match(
    migration,
    /order by campus_admin_priority,[\s\S]*limit least/i
  );
  assert.match(
    migration,
    /order by\s+candidate\.campus_admin_priority,\s+candidate\.name/i
  );
});

test('campus administrator search can find users outside the selected campus', () => {
  const migration = readFileSync(
    `${migrationDirectory}/20260610030001_120_search_all_users_for_campus_admin.sql`,
    'utf8'
  );
  const adminPage = readFileSync(
    'src/pages/admin/AdminCampusAdminManagePage.tsx',
    'utf8'
  );

  assert.match(
    migration,
    /where nullif\(trim\(p_query\), ''\) is null[\s\S]*concat_ws\([\s\S]*profile\.campus[\s\S]*ilike/i
  );
  assert.doesNotMatch(
    migration,
    /from public\.profiles profile\s+where \(nullif\(trim\(p_district\)/i
  );
  assert.match(adminPage, /query: searchQuery \|\| undefined/i);
  assert.match(adminPage, /managesSelectedCampus\(/i);
  assert.match(
    adminPage,
    /\) : isCurrentSelectedCampusAdmin \? \([\s\S]*handleCancelCampusAdmin/i
  );
  assert.match(
    migration,
    /candidate\.district,\s+candidate\.team,\s+candidate\.campus,/i
  );
});

test('campus payment account upserts use an unambiguous conflict target', () => {
  const migration = readFileSync(
    `${migrationDirectory}/20260610040001_121_fix_campus_payment_account_campus_id_ambiguity.sql`,
    'utf8'
  );

  assert.match(
    migration,
    /on conflict on constraint campus_payment_accounts_pkey do update/gi
  );
  assert.doesNotMatch(migration, /on conflict \(campus_id\) do update/i);
});
