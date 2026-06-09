import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const setupSql = readFileSync(
  'sql/setup/147_secure_admin_created_account_source.sql',
  'utf8',
);
const migrationSql = readFileSync(
  'supabase/migrations/20260610230008_147_secure_admin_created_account_source.sql',
  'utf8',
);
const adminUserManager = readFileSync(
  'supabase/functions/admin-user-manager/index.ts',
  'utf8',
);

test('account-source trust-boundary setup SQL matches its migration', () => {
  assert.equal(setupSql, migrationSql);
});

test('auth trigger cannot promote user-controlled metadata to admin-created', () => {
  assert.match(setupSql, /coordinator_phone,\s*account_source, updated_at/i);
  assert.match(setupSql, /'self_signup',\s*now\(\)/i);
  assert.doesNotMatch(
    setupSql,
    /new\.raw_user_meta_data\s*->>\s*'account_source'/i,
  );
  assert.doesNotMatch(setupSql, /account_source\s*=\s*excluded\.account_source/i);
});

test('trusted admin user manager explicitly marks admin-created profiles', () => {
  assert.match(
    adminUserManager,
    /serviceClient\.from\('profiles'\)\.upsert\(\{[\s\S]*account_source: 'admin_created'/i,
  );
});
