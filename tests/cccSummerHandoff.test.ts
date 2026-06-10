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

test('CCC Summer handoff recovers safely from partial account creation', () => {
  assert.match(edgeFunction, /ccc_summer_subject_id: subjectId/);
  assert.match(edgeFunction, /findRecoverableAuthUser/);
  assert.match(edgeFunction, /serviceClient\.auth\.admin\.listUsers/);
  assert.match(edgeFunction, /metadata\.account_source === 'ccc_summer'/);
  assert.match(edgeFunction, /serviceClient\.auth\.admin\.deleteUser\(createdUserId\)/);
  assert.match(edgeFunction, /account_update_failed/);
  assert.ok(
    edgeFunction.indexOf("if (profileError || linkUpsertError)") <
      edgeFunction.indexOf("if (updateExistingAuthUser)"),
    'Existing Auth credentials must change only after profile and identity synchronization.'
  );
});

test('CCC Summer handoff keeps reusable campus mappings server-controlled', () => {
  assert.equal(migrationSql, setupSql);
  assert.match(setupSql, /'self_signup', 'admin_created', 'ccc_summer'/i);
  assert.match(setupSql, /create table if not exists public\.ccc_summer_campus_mappings/i);
  assert.match(setupSql, /univ_no bigint primary key/i);
  assert.match(edgeFunction, /action === 'select-campus'/);
  assert.match(edgeFunction, /\.from\('ccc_summer_campus_mappings'\)/);
  assert.match(edgeFunction, /requiresCampusSelection: !campus/);

  const selectCampusAction = edgeFunction.slice(
    edgeFunction.indexOf("if (action === 'select-campus')"),
    edgeFunction.indexOf("if (action !== 'exchange')")
  );
  assert.doesNotMatch(selectCampusAction, /ccc_summer_campus_mappings/);
  assert.match(selectCampusAction, /\.from\('profiles'\)[\s\S]*\.eq\('id', user\.id\)/);
});

test('CCC Summer handoff exposes every linked CCC field only to its authenticated user', () => {
  const profileAction = edgeFunction.slice(
    edgeFunction.indexOf("if (action === 'profile')"),
    edgeFunction.indexOf("if (action === 'select-campus')")
  );

  assert.match(profileAction, /userClient\.auth\.getUser\(\)/);
  assert.match(profileAction, /\.eq\('user_id', user\.id\)/);
  assert.match(
    profileAction,
    /subject_id, is_staff, univ_no, univ_name, branch_no, branch_name/
  );
  assert.match(profileAction, /subjectId: link\.subject_id/);
  assert.match(profileAction, /isStaff: link\.is_staff/);
  assert.match(profileAction, /univNo: link\.univ_no/);
  assert.match(profileAction, /univName: link\.univ_name/);
  assert.match(profileAction, /branchNo: link\.branch_no/);
  assert.match(profileAction, /branchName: link\.branch_name/);
});
