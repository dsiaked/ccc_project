import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const edgeFunction = readFileSync(
  'supabase/functions/ccc-summer-handoff/index.ts',
  'utf8'
);
const setupSql = readFileSync(
  'sql/setup/162_ccc_summer_campus_mapping.sql',
  'utf8'
);
const migrationSql = readFileSync(
  'supabase/migrations/20260610230026_162_ccc_summer_campus_mapping.sql',
  'utf8'
);
const envExample = readFileSync('.env.example', 'utf8');

test('CCC Summer handoff uses the registered Seoul return bus client', () => {
  assert.match(envExample, /VITE_CCC_SUMMER_CLIENT_ID=bus-seoul-return/);
  assert.match(envExample, /CCC_SUMMER_CLIENT_ID=bus-seoul-return/);
  assert.doesNotMatch(envExample, /ccc-seoulbus/);
});

test('CCC Summer handoff exchanges codes only on the server', () => {
  assert.match(edgeFunction, /\/api\/handoff\/exchange/);
  assert.match(edgeFunction, /CCC_SUMMER_CLIENT_ID/);
  assert.match(edgeFunction, /CCC_SUMMER_REDIRECT_URIS/);
  assert.match(edgeFunction, /serviceClient\.auth\.admin\.createUser/);
  assert.match(edgeFunction, /loginClient\.auth\.signInWithPassword/);
  assert.doesNotMatch(edgeFunction, /insert into public\.admin_roles/i);
});

test('CCC Summer handoff supports reusable and user-selected campus mappings', () => {
  assert.equal(migrationSql, setupSql);
  assert.match(setupSql, /'self_signup', 'admin_created', 'ccc_summer'/i);
  assert.match(setupSql, /create table if not exists public\.ccc_summer_campus_mappings/i);
  assert.match(setupSql, /univ_no bigint primary key/i);
  assert.match(edgeFunction, /action === 'select-campus'/);
  assert.match(edgeFunction, /\.from\('ccc_summer_campus_mappings'\)/);
  assert.match(edgeFunction, /requiresCampusSelection: !campus/);
});
