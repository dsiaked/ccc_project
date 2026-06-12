import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const page = readFileSync(
  'src/pages/admin/AdminReservationDeadlinePage.tsx',
  'utf8'
);

test('reservation deadline changes use a scoped safety modal', () => {
  assert.match(page, /setPendingAction\([\s\S]*mode: 'set'/);
  assert.match(page, /setPendingAction\(\{ mode: 'clear' \}\)/);
  assert.match(page, /setPendingAction\(\{ mode: 'immediate' \}\)/);
  assert.match(page, /id="deadline-action-dialog-title"/);
  assert.match(page, /마감 제한을 해제해 사용자가 신청 정보를 다시 저장하고 수정/);
  assert.match(page, /배차 계산, 잔여 좌석 신청, 캠퍼스 송금 보고/);
  assert.match(page, /autoFocus[\s\S]*현재 설정 유지/);
  assert.doesNotMatch(page, /window\.confirm/);
});

test('reservation deadline modal blocks duplicates and keeps failures visible', () => {
  assert.match(page, /const deadlineActionInFlightRef = useRef\(false\)/);
  assert.match(
    page,
    /deadlineActionInFlightRef\.current = true[\s\S]*updateReservationDeadline\([\s\S]*nextDeadline,[\s\S]*nextOpensAt[\s\S]*\)[\s\S]*deadlineActionInFlightRef\.current = false/
  );
  assert.match(page, /setDialogError\(/);
  assert.match(page, /className=\{styles\.actionDialogError\} role="alert"/);
  assert.match(page, /onClick=\{\(\) => void confirmDeadlineAction\(\)\}/);
});
