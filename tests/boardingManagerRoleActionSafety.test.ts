import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const page = readFileSync(
  'src/pages/admin/AdminBoardingManagerPage.tsx',
  'utf8'
);

test('boarding manager role changes use a scoped safety modal', () => {
  assert.match(page, /setPendingRoleAction\(\{ mode: 'cancel', user \}\)/);
  assert.match(page, /setPendingRoleAction\(\{ mode: 'assign', users: selectedUsers \}\)/);
  assert.match(page, /id="role-action-title"/);
  assert.match(page, /탑승 관리 화면 접근 권한을 잃고, 현재 담당 호차 지정이 모두 삭제됩니다/);
  assert.match(page, /지정 후 담당 호차를 별도로 선택해야 합니다/);
  assert.match(page, /autoFocus[\s\S]*현재 권한 유지/);
  assert.doesNotMatch(page, /window\.confirm/);
});

test('boarding manager role modal blocks duplicates and preserves failed assignment targets', () => {
  assert.match(page, /const roleActionInFlightRef = useRef\(false\)/);
  assert.match(
    page,
    /roleActionInFlightRef\.current = true[\s\S]*Promise\.allSettled[\s\S]*roleActionInFlightRef\.current = false/
  );
  assert.match(page, /setPendingRoleAction\(\{ mode: 'assign', users: failedUsers \}\)/);
  assert.match(page, /아래 실패 대상만 다시 시도할 수 있습니다/);
  assert.match(page, /className=\{styles\.modalError\} role="alert"/);
  assert.match(page, /onClick=\{\(\) => void confirmRoleAction\(\)\}/);
});
