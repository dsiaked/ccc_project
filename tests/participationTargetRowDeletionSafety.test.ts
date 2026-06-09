import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const page = readFileSync(
  'src/pages/admin/AdminParticipationTargetsPage.tsx',
  'utf8'
);

test('participation target row deletion uses a scoped safety modal', () => {
  assert.match(page, /setPendingRowDeletion\(\{ mode: 'selected', rows: \[\.\.\.targetRows\] \}\)/);
  assert.match(page, /setPendingRowDeletion\(\{ mode: 'filtered', rows: \[\.\.\.targetRows\] \}\)/);
  assert.match(page, /id="row-deletion-dialog-title"/);
  assert.match(page, /DB의 실제 지구·팀·캠퍼스 조직 구조는 삭제되지 않습니다/);
  assert.match(page, /제거되는 참여 목표 합계/);
  assert.match(page, /필터 결과 삭제는 현재\s+화면에 표시된 행만 대상으로 고정/);
  assert.match(page, /autoFocus[\s\S]*설정 행 유지/);
});

test('participation target deletion snapshots targets and removes browser confirms', () => {
  assert.match(page, /const rowDeletionInFlightRef = useRef\(false\)/);
  assert.match(
    page,
    /const targetRows = pendingRowDeletion\.rows[\s\S]*const targetKeys = new Set\(targetRows\.map\(\(row\) => row\.key\)\)/
  );
  assert.match(page, /pushUndoSnapshot\(\)[\s\S]*saveParticipationTargets\(nextTargets\)[\s\S]*saveCampuses/);
  assert.match(page, /onClick=\{confirmRowDeletion\}/);
  assert.doesNotMatch(page, /window\.confirm/);
});
