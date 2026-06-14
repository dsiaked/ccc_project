import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import test from 'node:test';

const migrationDirectory = 'supabase/migrations';
const migrationFiles = readdirSync(migrationDirectory)
  .filter((file) => file.endsWith('.sql'))
  .sort();
const migrationSql = migrationFiles
  .map((file) => readFileSync(`${migrationDirectory}/${file}`, 'utf8'))
  .join('\n');

const sqlName = (name: string) =>
  name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const functionPattern = (name: string) =>
  new RegExp(
    `create or replace function\\s+(?:"public"\\.|public\\.)?"?${sqlName(
      name
    )}"?\\s*\\(`,
    'i'
  );

const tablePattern = (name: string) =>
  new RegExp(
    `create table (?:if not exists )?(?:"public"\\.|public\\.)?"?${sqlName(
      name
    )}"?(?=\\s|\\()`,
    'i'
  );

test('migration chain starts from the squashed production baseline', () => {
  assert.equal(
    migrationFiles[0],
    '20260613000001_204_extend_allocation_cancellation_timeout.sql'
  );
  assert.equal(existsSync('sql/setup/combined_supabase_setup.sql'), false);
});

test('migration files preserve valid UTF-8 text', () => {
  for (const file of migrationFiles) {
    const sql = readFileSync(`${migrationDirectory}/${file}`, 'utf8');
    assert.equal(
      sql.includes('\uFFFD'),
      false,
      `${file} contains invalid UTF-8 text.`
    );
  }
});

test('migration chain defines the core public tables', () => {
  for (const table of [
    'reservations',
    'payments',
    'admin_roles',
    'bus_options',
    'bus_allocations',
    'profiles',
    'stations',
    'campus_requests',
    'campus_notice_reads',
    'home_announcements',
    'destination_queue_buses',
  ]) {
    assert.match(migrationSql, tablePattern(table), `${table} is missing`);
  }
});

test('migration chain contains RPCs required by administrator flows', () => {
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
    'cancel_confirmed_allocation_workspace',
    'cancel_confirmed_allocation_workspace_v2',
    'get_boarding_management_snapshot',
    'set_passenger_boarding_status',
    'update_passenger_boarding_note',
    'mark_boarding_bus_departed',
    'cancel_boarding_bus_departure',
    'get_boarding_move_request_snapshot',
    'request_boarding_passenger_move',
    'respond_to_boarding_move_request',
    'get_boarding_exception_archive_snapshot',
    'archive_boarding_exception_as_global_admin',
    'restore_boarding_exception_as_global_admin',
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
    'confirm_destination_queue_allocation',
    'start_destination_queue_bus',
    'get_destination_queue_boarding_snapshot',
  ]) {
    assert.match(
      migrationSql,
      functionPattern(functionName),
      `Migration chain must define ${functionName}.`
    );
  }
});

test('reservation normalization has reached validated compatibility storage', () => {
  assert.match(migrationSql, /add column if not exists organization_snapshot jsonb/i);
  assert.match(migrationSql, /alter column organization_snapshot set not null/i);
  assert.match(
    migrationSql,
    /reservations_extra_data_excludes_canonical_fields/i
  );
});

test('migration chain defines every statically called application RPC', () => {
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
    assert.match(
      migrationSql,
      functionPattern(rpcName),
      `${rpcName} is called by the application but missing from the migration chain`
    );
  }
});
