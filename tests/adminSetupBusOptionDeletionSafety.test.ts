import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const page = readFileSync('src/pages/admin/AdminSetupCheckPage.tsx', 'utf8');

test('admin bus option deletion uses an accessible safety modal', () => {
  assert.match(page, /setPendingBusOptionDeletion\(option\)/);
  assert.match(page, /id="bus-option-delete-dialog-title"/);
  assert.match(page, /버스 옵션 영구 삭제/);
  assert.match(page, /새 옵션을 등록하기\s+전까지 버스 옵션 설정은 미완료 상태/);
  assert.match(page, /배차 계산 기준으로 사용할 수\s+없습니다/);
  assert.match(page, /autoFocus[\s\S]*버스 옵션 유지/);
});

test('admin bus option deletion blocks duplicate execution and removes browser confirms', () => {
  assert.match(page, /const busOptionDeletionInFlightRef = useRef\(false\)/);
  assert.match(
    page,
    /busOptionDeletionInFlightRef\.current = true[\s\S]*deleteBusOption\(option\.id\)[\s\S]*busOptionDeletionInFlightRef\.current = false/
  );
  assert.match(page, /setBusOptionDeleteDialogError\(/);
  assert.match(page, /onClick=\{\(\) => void confirmDeleteBusOption\(\)\}/);
  assert.doesNotMatch(page, /window\.confirm/);
});
