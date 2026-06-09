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

test('invitation code migration hashes codes and keeps plaintext for administrator copy actions', () => {
  const migration = readFileSync(
    'supabase/migrations/20260610210001_138_admin_invitation_codes.sql',
    'utf8'
  );

  assert.match(migration, /code_hash bytea not null unique/i);
  assert.match(migration, /digest\(v_raw, 'sha256'\)/i);
  assert.match(migration, /\bcode text\b/i);
  assert.match(migration, /code_hash, code, code_hint/i);
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

test('invitation code pgcrypto calls can resolve from the Supabase extensions schema', () => {
  const migration = readFileSync(
    'supabase/migrations/20260610230006_145_fix_invitation_code_pgcrypto_search_path.sql',
    'utf8'
  );

  for (const signature of [
    'validate_admin_invitation_codes\\(text\\[\\]\\)',
    'redeem_admin_invitation_codes_for_user\\(uuid, text\\[\\]\\)',
    'create_admin_invitation_code\\(text, uuid\\)',
  ]) {
    assert.match(
      migration,
      new RegExp(`alter function public\\.${signature}\\s+set search_path = public, extensions`, 'i')
    );
  }
  assert.equal(
    readFileSync(
      'sql/setup/145_fix_invitation_code_pgcrypto_search_path.sql',
      'utf8'
    ).replaceAll('\r\n', '\n'),
    migration.replaceAll('\r\n', '\n')
  );
});

test('bulk invitation creation is atomic, bounded, and keeps campus invitations singular', () => {
  const migration = readFileSync(
    'supabase/migrations/20260610225001_142_bulk_admin_invitation_codes.sql',
    'utf8'
  );

  assert.match(migration, /create or replace function public\.create_admin_invitation_codes/i);
  assert.match(migration, /p_count < 1 or p_count > 50/i);
  assert.match(migration, /p_role = 'campus_admin' and p_count <> 1/i);
  assert.match(migration, /public\.create_admin_invitation_code\(p_role, p_campus_id\)/i);
  assert.equal(
    readFileSync('sql/setup/142_bulk_admin_invitation_codes.sql', 'utf8').replaceAll(
      '\r\n',
      '\n'
    ),
    migration.replaceAll('\r\n', '\n')
  );
});

test('administrator invitation page can issue and copy multiple codes', () => {
  const page = readFileSync(
    'src/pages/admin/AdminInvitationCodesPage.tsx',
    'utf8'
  );

  assert.match(page, /createAdminInvitationCodes/);
  assert.match(page, /max=\{50\}/);
  assert.match(page, /createdInvitations\.map/);
  assert.match(page, /join\('\\n'\)/);
  assert.match(page, /invitation\.code \?\? invitation\.codeHint/);
  assert.match(page, /handleCopyCode/);
});

test('plaintext invitation code storage patch matches its setup SQL', () => {
  const migration = readFileSync(
    'supabase/migrations/20260610230009_148_store_invitation_code_plaintext.sql',
    'utf8'
  );

  assert.match(migration, /add column if not exists code text/i);
  assert.match(migration, /code_hash, code, code_hint/i);
  assert.equal(
    readFileSync('sql/setup/148_store_invitation_code_plaintext.sql', 'utf8').replaceAll(
      '\r\n',
      '\n'
    ),
    migration.replaceAll('\r\n', '\n')
  );
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

test('single invitation issuance remains compatible before the bulk RPC migration', () => {
  const service = readFileSync('src/lib/invitationCodeService.ts', 'utf8');

  assert.match(service, /if \(count === 1\)/);
  assert.match(service, /return \[await createAdminInvitationCode\(role, campusId\)\]/);
  assert.match(service, /error\.code === 'PGRST202'/);
});
