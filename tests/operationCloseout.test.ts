import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const migration = readFileSync('sql/setup/166_operation_closeout.sql', 'utf8');
const page = readFileSync('src/pages/admin/AdminOperationCloseoutPage.tsx', 'utf8');

test('operation closeout validates required checks on the server', () => {
  assert.match(migration, /v_bus_total = v_departed_bus_total/);
  assert.match(migration, /v_unresolved_exception_total = 0/);
  assert.match(migration, /v_active_reservation_total = v_paid_reservation_total/);
  assert.match(migration, /v_seoul_campus_total = v_confirmed_transfer_total/);
  assert.match(migration, /Required post-operation checks are not complete/);
});

test('non-required closeout checks remain non-blocking', () => {
  assert.match(page, /경고만 표시되며 운영 마감을 막지 않습니다/);
  assert.match(page, /권장 항목/);
  assert.match(page, /선택 항목/);
  assert.match(page, /운영 마감 취소/);
  assert.match(page, /마감 상태는 유지되며/);
  assert.match(page, /운영 마감을 완료할까요/);
  assert.match(page, /미처리 문의 \{summary\.unresolvedInquiryTotal\}건은 운영 마감을 막지 않습니다/);
});
