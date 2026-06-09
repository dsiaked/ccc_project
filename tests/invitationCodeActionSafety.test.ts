import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const page = readFileSync('src/pages/admin/AdminInvitationCodesPage.tsx', 'utf8');

test('invitation cancellation and cleanup use a scoped safety modal', () => {
  assert.match(page, /setPendingAction\(\{ mode: 'cancel', invitation \}\)/);
  assert.match(page, /setPendingAction\(\{ mode: 'cleanup' \}\)/);
  assert.match(page, /id="invitation-action-dialog-title"/);
  assert.match(page, /취소 즉시 이 코드는 권한 등록에 사용할 수 없게 됩니다/);
  assert.match(page, /취소·만료된 코드, 사용 후 30일이 지난 코드와 1년이 지난/);
  assert.match(page, /실제 삭제 건수는 서버 실행 시점에 결정됩니다/);
  assert.match(page, /autoFocus[\s\S]*현재 상태 유지/);
  assert.doesNotMatch(page, /window\.confirm/);
});

test('invitation action modal blocks duplicate execution and keeps failures visible', () => {
  assert.match(page, /const invitationActionInFlightRef = useRef\(false\)/);
  assert.match(
    page,
    /invitationActionInFlightRef\.current = true[\s\S]*cancelAdminInvitationCode[\s\S]*cleanupAdminInvitationCodes[\s\S]*invitationActionInFlightRef\.current = false/
  );
  assert.match(page, /setActionDialogError\(/);
  assert.match(page, /className=\{styles\.actionDialogError\} role="alert"/);
  assert.match(page, /onClick=\{\(\) => void confirmPendingAction\(\)\}/);
});
