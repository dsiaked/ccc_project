import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const adminUserManager = readFileSync(
  'supabase/functions/admin-user-manager/index.ts',
  'utf8'
);
const personalTicketService = readFileSync(
  'src/lib/admin/personalTicketService.ts',
  'utf8'
);
const personalTicketPage = readFileSync(
  'src/pages/admin/AdminPersonalTicketPage.tsx',
  'utf8'
);
const removalMigration = readFileSync(
  'supabase/migrations/20260613000009_212_remove_profile_plaintext_password.sql',
  'utf8'
);

test('admin account creation sends passwords only to Supabase Auth', () => {
  assert.match(
    adminUserManager,
    /auth\.admin\.createUser\(\{[\s\S]*password[\s\S]*\}\)/
  );
  assert.doesNotMatch(
    adminUserManager,
    /from\('profiles'\)\.upsert\(\{[\s\S]*\bpassword,/
  );
});

test('personal ticket management never maps or displays account passwords', () => {
  assert.doesNotMatch(personalTicketService, /\bpassword\b/i);
  assert.doesNotMatch(personalTicketPage, /selectedReservation\.password/);
  assert.doesNotMatch(personalTicketPage, /accountPassword/);
});

test('latest migration removes plaintext profile passwords after RPC cleanup', () => {
  assert.match(removalMigration, /pg_get_functiondef/i);
  assert.match(removalMigration, /drop column if exists password/i);
  assert.match(removalMigration, /Refusing to drop profiles\.password/i);
});
