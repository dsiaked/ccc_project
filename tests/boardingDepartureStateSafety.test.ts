import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const boardingPage = readFileSync('src/pages/admin/AdminBoardingPage.tsx', 'utf8');
const migration = readFileSync(
  'supabase/migrations/20260611000014_184_allow_departed_boarding_corrections.sql',
  'utf8'
);

test('departed buses allow result corrections but keep structural actions locked in the UI', () => {
  assert.match(
    boardingPage,
    /if \(status === 'unchecked' && passengerBus\?\.departedAt\) \{[\s\S]*미확인 상태로 되돌릴 수 없습니다/
  );
  assert.match(boardingPage, /출발 완료 후에는 탑승 결과 정정과 전달사항만 수정할 수 있습니다/);
  assert.match(boardingPage, /disabled=\{isSelectedBusLocked\}/);
  assert.match(boardingPage, /disabled=\{isSelectedPassengerBusDeparted\}/);
  assert.doesNotMatch(boardingPage, /isPassengerBusLocked/);
  assert.doesNotMatch(boardingPage, /aria-required=\{isWritingNoShowReason\}\s*disabled=/);
});

test('server keeps departed bus assignments locked while allowing status and note corrections', () => {
  assert.match(
    migration,
    /old\.confirmed_ticket is distinct from new\.confirmed_ticket[\s\S]*Departed bus assignments are locked/i
  );
  assert.match(
    migration,
    /tg_op <> 'UPDATE'[\s\S]*Departed bus rosters are locked/i
  );
  assert.match(
    migration,
    /new\.boarding_status = 'unchecked'[\s\S]*Departed buses cannot return passengers to unchecked status/i
  );
  assert.doesNotMatch(migration, /boarding_note is distinct/i);
});

test('server still allows automatic departure and cancellation transitions', () => {
  assert.match(
    migration,
    /old\.boarding_status = 'unchecked'[\s\S]*new\.boarding_status = 'no_show'[\s\S]*new\.boarding_no_show_departure_id = v_departure_id/i
  );
  assert.match(
    migration,
    /old\.boarding_status = 'no_show'[\s\S]*new\.boarding_status = 'unchecked'[\s\S]*new\.boarding_no_show_departure_id is null/i
  );
});
