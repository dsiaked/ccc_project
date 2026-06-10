import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const page = readFileSync('src/pages/admin/AdminBoardingPage.tsx', 'utf8');
const migration = readFileSync(
  'sql/setup/165_lock_departed_bus_boarding_edits.sql',
  'utf8'
);

test('departed buses lock boarding status and note edits in the UI', () => {
  assert.match(page, /const isPassengerBusDeparted/);
  assert.match(page, /출발 완료된 호차는 탑승 상태를 변경할 수 없습니다/);
  assert.match(page, /출발 완료된 호차는 전달사항을 수정할 수 없습니다/);
  assert.match(page, /disabled=\{isSelectedPassengerBusDeparted\}/);
});

test('departed buses lock reservation and walk-in edits on the server', () => {
  assert.match(migration, /Departed buses cannot update boarding status\./g);
  assert.match(migration, /Departed buses cannot update boarding notes\./g);
  assert.match(migration, /set_passenger_boarding_status/);
  assert.match(migration, /set_walk_in_boarding_status/);
  assert.match(migration, /update_passenger_boarding_note/);
  assert.match(migration, /update_walk_in_boarding_note/);
});
