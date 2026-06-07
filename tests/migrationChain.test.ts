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

  for (const marker of [
    'BEGIN sql/setup/80_notice_audience_and_lifecycle.sql',
    'BEGIN sql/setup/91_atomic_campus_request_workflow.sql',
    'BEGIN sql/setup/92_campus_request_read_and_audit.sql',
  ]) {
    assert.match(combined, new RegExp(marker));
  }

  assert.match(combined, /create table if not exists public\.campus_notice_targets/i);
  assert.match(combined, /create table if not exists public\.campus_request_reads/i);
  assert.match(combined, /create table if not exists public\.campus_request_audit_logs/i);
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
