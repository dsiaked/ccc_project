import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const page = readFileSync(
  'src/pages/admin/AdminBoardingExceptionsPage.tsx',
  'utf8'
);

test('boarding exception archive and restore actions use a scoped safety modal', () => {
  assert.match(page, /setPendingAction\(\{ mode: 'archive', record \}\)/);
  assert.match(page, /setPendingAction\(\{ mode: 'restore', record \}\)/);
  assert.match(page, /id="exception-action-dialog-title"/);
  assert.match(page, /현재 기록 스냅샷을 보관하고 미해결 목록에서 제외합니다/);
  assert.match(page, /원본 탑승 기록은 삭제되지 않습니다/);
  assert.match(page, /보관 표시를 제거하고 이 기록을 미해결 목록으로 되돌립니다/);
  assert.match(page, /autoFocus[\s\S]*현재 상태 유지/);
  assert.doesNotMatch(page, /window\.confirm/);
});

test('boarding exception action modal blocks duplicates and keeps failures visible', () => {
  assert.match(page, /const actionInFlightRef = useRef\(false\)/);
  assert.match(
    page,
    /actionInFlightRef\.current = true[\s\S]*archiveBoardingException[\s\S]*restoreBoardingException[\s\S]*actionInFlightRef\.current = false/
  );
  assert.match(page, /setActionDialogError\(/);
  assert.match(page, /className=\{styles\.actionModalError\} role="alert"/);
  assert.match(page, /onClick=\{\(\) => void confirmPendingAction\(\)\}/);
});
