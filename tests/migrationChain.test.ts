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
    '80_remaining_seat_payment_workflow.sql',
    '20260608120001_80_remaining_seat_payment_workflow.sql',
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
