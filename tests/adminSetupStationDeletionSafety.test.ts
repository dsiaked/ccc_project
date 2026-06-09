import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const page = readFileSync('src/pages/admin/AdminSetupCheckPage.tsx', 'utf8');

test('admin station deletion uses an accessible safety modal', () => {
  assert.match(page, /setPendingStationDeletion\(station\)/);
  assert.match(page, /id="station-delete-dialog-title"/);
  assert.match(page, /행선지 영구 삭제/);
  assert.match(page, /데이터베이스에서 영구 삭제되며/);
  assert.match(page, /기존 신청 등 다른 데이터가 이 행선지를 참조하고 있으면 삭제가\s+거부될 수 있습니다/);
  assert.match(page, /autoFocus[\s\S]*행선지 유지/);
});

test('admin station deletion blocks duplicate execution and keeps errors in the modal', () => {
  assert.match(page, /const stationDeletionInFlightRef = useRef\(false\)/);
  assert.match(
    page,
    /stationDeletionInFlightRef\.current = true[\s\S]*delete_station_as_global_admin[\s\S]*stationDeletionInFlightRef\.current = false/
  );
  assert.match(page, /setStationDeleteDialogError\(/);
  assert.match(page, /className=\{styles\.dataResetDialogError\} role="alert"/);
  assert.match(page, /onClick=\{\(\) => void confirmDeleteStation\(\)\}/);
  assert.doesNotMatch(
    page,
    /const handleDeleteStation[\s\S]*?window\.confirm[\s\S]*?const handleAddBusOption/
  );
});
