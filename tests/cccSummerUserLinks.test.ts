import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const setupSql = readFileSync(
  'sql/setup/157_ccc_summer_user_links.sql',
  'utf8'
);
const migrationSql = readFileSync(
  'supabase/migrations/20260610230021_157_ccc_summer_user_links.sql',
  'utf8'
);

test('CCC Summer identity links are service-role only', () => {
  assert.equal(migrationSql, setupSql);
  assert.match(setupSql, /create table if not exists public\.ccc_summer_user_links/i);
  assert.match(setupSql, /subject_id text primary key/i);
  assert.match(setupSql, /user_id uuid not null unique references auth\.users\(id\)/i);
  assert.match(setupSql, /alter table public\.ccc_summer_user_links enable row level security/i);
  assert.match(
    setupSql,
    /revoke all on table public\.ccc_summer_user_links\s+from public, anon, authenticated/i
  );
  assert.match(
    setupSql,
    /grant select, insert, update, delete on table public\.ccc_summer_user_links\s+to service_role/i
  );
  assert.doesNotMatch(setupSql, /create policy/i);
});

test('CCC Summer staff classification cannot grant an admin role', () => {
  assert.match(setupSql, /is_staff boolean not null default false/i);
  assert.doesNotMatch(setupSql, /insert into public\.admin_roles/i);
});
