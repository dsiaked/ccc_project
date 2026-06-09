import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { parseInvitationCodes } from '../src/utils/invitationCodes.js';

test('multiple invitation codes can be pasted with common separators', () => {
  assert.deepEqual(
    parseInvitationCodes('AAAA-BBBB\nCCCC-DDDD, EEEE-FFFF  AAAA-BBBB'),
    ['AAAA-BBBB', 'CCCC-DDDD', 'EEEE-FFFF']
  );
});

test('invitation code migration keeps raw codes out of storage', () => {
  const migration = readFileSync(
    'supabase/migrations/20260610210001_138_admin_invitation_codes.sql',
    'utf8'
  );

  assert.match(migration, /code_hash bytea not null unique/i);
  assert.match(migration, /digest\(v_raw, 'sha256'\)/i);
  assert.doesNotMatch(migration, /\bcode text\b/i);
});

test('signup trigger redeems all invitation codes atomically', () => {
  const migration = readFileSync(
    'supabase/migrations/20260610210001_138_admin_invitation_codes.sql',
    'utf8'
  );

  assert.match(migration, /create or replace function public\.handle_new_auth_user/i);
  assert.match(
    migration,
    /perform public\.redeem_admin_invitation_codes_for_user\(\s*new\.id/i
  );
});

test('setup SQL and migration define the same invitation code feature', () => {
  assert.equal(
    readFileSync('sql/setup/138_admin_invitation_codes.sql', 'utf8').replaceAll(
      '\r\n',
      '\n'
    ),
    readFileSync(
      'supabase/migrations/20260610210001_138_admin_invitation_codes.sql',
      'utf8'
    ).replaceAll('\r\n', '\n')
  );
});

test('invitation code creation is global-admin-only and campus issuance is serialized', () => {
  const migration = readFileSync(
    'supabase/migrations/20260610210001_138_admin_invitation_codes.sql',
    'utf8'
  );

  assert.match(migration, /if not public\.is_global_admin\(\)/i);
  assert.match(migration, /interval '14 days'/i);
  assert.match(migration, /pg_advisory_xact_lock/i);
  assert.match(migration, /role in \('campus_admin', 'boarding_manager'\)/i);
});

test('invitation cleanup removes stale code rows while keeping audit history for one year', () => {
  const migration = readFileSync(
    'supabase/migrations/20260610210001_138_admin_invitation_codes.sql',
    'utf8'
  );

  assert.match(
    migration,
    /create or replace function public\.cleanup_admin_invitation_codes/i
  );
  assert.match(migration, /used_at <= clock_timestamp\(\) - interval '30 days'/i);
  assert.match(migration, /cancelled_at is not null/i);
  assert.match(migration, /expires_at <= clock_timestamp\(\)/i);
  assert.match(migration, /resource_type = 'admin_invitation_codes'/i);
  assert.match(migration, /created_at <= clock_timestamp\(\) - interval '1 year'/i);
});

test('administrator invitation page exposes the guarded cleanup action', () => {
  const page = readFileSync(
    'src/pages/admin/AdminInvitationCodesPage.tsx',
    'utf8'
  );

  assert.match(page, /cleanupAdminInvitationCodes/);
  assert.match(page, /지난 기록 정리/);
  assert.match(page, /사용 후 30일이 지난 코드/);
  assert.match(page, /1년이 지난 권한 등록 코드 감사 로그/);
});
