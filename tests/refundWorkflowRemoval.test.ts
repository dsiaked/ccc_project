import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const setupSql = readFileSync('sql/setup/187_remove_refund_workflow.sql', 'utf8');
const migrationSql = readFileSync(
  'supabase/migrations/20260611000017_187_remove_refund_workflow.sql',
  'utf8'
);
const remainingSeatService = readFileSync('src/lib/remainingSeatService.ts', 'utf8');
const adminService = readFileSync('src/lib/adminService.ts', 'utf8');

test('refund workflow removal setup matches its migration', () => {
  assert.equal(
    migrationSql.replaceAll('\r\n', '\n'),
    setupSql.replaceAll('\r\n', '\n')
  );
});

test('refund states are migrated to completed and rejected going forward', () => {
  assert.match(setupSql, /where status in \('refund_required', 'refunded'\)/);
  assert.match(setupSql, /check \(status in \('pending', 'completed'\)\)/);
  assert.match(setupSql, /set[\s\S]*status = 'pending'[\s\S]*paid_at = null/);
});

test('cancel-refund inquiries are migrated to etc and removed from the public type', () => {
  assert.match(setupSql, /set type = 'etc'[\s\S]*where type = 'cancel_refund'/);
  assert.doesNotMatch(adminService, /cancel_refund/);
});

test('payment-confirmed remaining seat claims cannot be cancelled', () => {
  assert.match(
    setupSql,
    /if v_payment_status = 'completed' then[\s\S]*Payment-confirmed remaining seat claims cannot be cancelled/
  );
  assert.match(
    remainingSeatService,
    /입금 확인이 완료된 잔여 좌석 신청은 취소할 수 없습니다/
  );
});
