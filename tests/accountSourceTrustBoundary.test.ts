import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const setupSql = readFileSync(
  'sql/setup/147_secure_admin_created_account_source.sql',
  'utf8',
);
const migrationSql = readFileSync(
  'sql/setup/147_secure_admin_created_account_source.sql',
  'utf8',
);
const adminUserManager = readFileSync(
  'supabase/functions/admin-user-manager/index.ts',
  'utf8',
);
const personalTicketService = readFileSync(
  'src/lib/admin/personalTicketService.ts',
  'utf8',
);
const boardingService = readFileSync(
  'src/lib/admin/boardingManagementService.ts',
  'utf8',
);
const personalTicketPage = readFileSync(
  'src/pages/admin/AdminPersonalTicketPage.tsx',
  'utf8',
);
const boardingPage = readFileSync(
  'src/pages/admin/AdminBoardingPage.tsx',
  'utf8',
);
const destinationQueueBoardingPanel = readFileSync(
  'src/pages/admin/DestinationQueueBoardingPanel.tsx',
  'utf8',
);
const adminCreatedBadgeMigration = readFileSync(
  'supabase/migrations/20260626000001_235_admin_created_account_badges.sql',
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

test('administrator-created accounts are exposed with explicit admin badges', () => {
  assert.match(adminCreatedBadgeMigration, /account_source as account_source/i);
  assert.match(adminCreatedBadgeMigration, /'accountSource'/i);
  assert.match(personalTicketService, /accountSource/);
  assert.match(boardingService, /accountSource/);
  assert.match(personalTicketPage, /accountSource === 'admin_created'/);
  assert.match(boardingPage, /accountSource === 'admin_created'/);
  assert.match(destinationQueueBoardingPanel, /accountSource === 'admin_created'/);
});
