import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const page = readFileSync(
  'src/pages/admin/AdminAllocationWorkspacePage.tsx',
  'utf8'
);

test('allocation confirmation uses a safety modal with operational scope', () => {
  assert.match(page, /setConfirmDialogOpen\(true\)/);
  assert.match(page, /role="dialog"/);
  assert.match(page, /최신 신청자와 배차 상태를 다시 검증한 뒤 확정합니다/);
  assert.match(page, /확정 탑승자/);
  assert.match(page, /운행 버스/);
  assert.match(page, /현재 경고/);
  assert.match(page, /잔여 좌석 미입금/);
  assert.match(page, /버스표 공개 · 배차 편집 잠금/);
  assert.match(page, /autoFocus/);
  assert.doesNotMatch(
    page,
    /전체 배차를 확정할까요\? 탑승자에게 확정 버스표가 공개됩니다\.[\s\S]*window\.confirm/
  );
});

test('allocation confirmation modal preserves server preflight and blocks duplicates', () => {
  assert.match(page, /const confirmationInFlightRef = useRef\(false\)/);
  assert.match(
    page,
    /confirmationInFlightRef\.current = true[\s\S]*validateAllocationWorkspaceConfirmation[\s\S]*confirmAllocationWorkspace[\s\S]*confirmationInFlightRef\.current = false/
  );
});

test('allocation confirmation cancellation explains ticket visibility and draft transition', () => {
  assert.match(page, /setCancelDialogOpen\(true\)/);
  assert.match(page, /탑승자에게 공개된 확정 버스표가 즉시 숨겨지고/);
  assert.match(page, /영향받는 탑승자/);
  assert.match(page, /버스표 숨김 · 배차 초안 전환/);
  assert.match(page, /const cancellationInFlightRef = useRef\(false\)/);
  assert.match(
    page,
    /cancellationInFlightRef\.current = true[\s\S]*cancelConfirmedWorkspace[\s\S]*cancellationInFlightRef\.current = false/
  );
  assert.doesNotMatch(
    page,
    /배차 확정을 취소할까요\? 탑승자의 확정 버스표가 숨겨집니다\.[\s\S]*window\.confirm/
  );
});

test('bus deletion modal explains the unassigned passenger impact', () => {
  assert.match(page, /setPendingBusDeletion\(bus\)/);
  assert.match(page, /탑승자의 호차와 좌석이 모두 해제되어 미배차 상태로/);
  assert.match(page, /변경사항 저장 전에는 서버 배차안에 반영되지 않습니다/);
  assert.match(page, /잔여 좌석 신청자/);
  assert.match(page, /버스 삭제 · 탑승자 미배차 전환/);
  assert.match(
    page,
    /const busId = pendingBusDeletion\.id[\s\S]*passenger\.busId === busId[\s\S]*busId: null, seatNumber: null/
  );
  assert.doesNotMatch(
    page,
    /이 버스를 삭제하고 탑승자를 미배차 상태로 옮길까요\?[\s\S]*window\.confirm/
  );
});

test('workspace deletion modal explains permanent record and version loss', () => {
  assert.match(page, /setDeleteWorkspaceDialogOpen\(true\)/);
  assert.match(page, /배차 초안 영구 삭제/);
  assert.match(page, /저장 기록, 복원 가능한 버전을 되돌릴 수 없습니다/);
  assert.match(page, /탑승자의 기존 신청 정보는 삭제되지 않습니다/);
  assert.match(page, /workspaceVersions\.length\.toLocaleString\(\)/);
  assert.match(page, /배차 초안 · 기록 · 버전 영구 삭제/);
  assert.match(page, /const workspaceDeletionInFlightRef = useRef\(false\)/);
  assert.match(
    page,
    /workspaceDeletionInFlightRef\.current = true[\s\S]*deleteDraftAllocationWorkspace\(row\)[\s\S]*navigate\('\/admin\/allocations'\)/
  );
  assert.doesNotMatch(
    page,
    /row\.allocation_name\}" 배차 초안을 삭제할까요\?[\s\S]*window\.confirm/
  );
});

test('version restore modal explains replacement and required save', () => {
  assert.match(page, /setPendingVersionRestore\(version\)/);
  assert.match(page, /현재 버스와 탑승자 배정이 선택한 저장 버전으로 교체됩니다/);
  assert.match(page, /변경사항을 저장해야 실제 서버 배차안에 반영됩니다/);
  assert.match(page, /pendingVersionRestore\.createdAt/);
  assert.match(page, /복원본 적용 · 별도 저장 필요/);
  assert.match(page, /const versionRestoreInFlightRef = useRef\(false\)/);
  assert.match(
    page,
    /versionRestoreInFlightRef\.current = true[\s\S]*getAllocationWorkspaceVersionSnapshot\(versionId\)[\s\S]*versionRestoreInFlightRef\.current = false/
  );
  assert.doesNotMatch(
    page,
    /version\.label\} 상태로 복원할까요\?[\s\S]*window\.confirm/
  );
});

test('dirty workspace navigation uses a modal that explains discarded and preserved work', () => {
  assert.match(page, /setLeaveWorkspaceDialogOpen\(true\)/);
  assert.match(page, /변경사항을 버리고 이동할까요\?/);
  assert.match(
    page,
    /저장하지 않은 버스 설정과 승객 배정 변경사항은[\s\S]*사라집니다/
  );
  assert.match(page, /마지막으로 저장한 배차 초안과 버전 기록은 그대로[\s\S]*유지됩니다/);
  assert.match(page, /계속 편집/);
  assert.match(page, /변경사항 버리고 이동/);
  assert.match(
    page,
    /const confirmNavigateToAllocations = useCallback\(\(\) => \{[\s\S]*navigate\('\/admin\/allocations'\)/
  );
  assert.doesNotMatch(page, /window\.confirm/);
});
