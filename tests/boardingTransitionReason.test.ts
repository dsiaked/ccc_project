import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const boardingPage = readFileSync('src/pages/admin/AdminBoardingPage.tsx', 'utf8');
const boardingService = readFileSync(
  'src/lib/admin/boardingManagementService.ts',
  'utf8'
);
const migration = readFileSync(
  'supabase/migrations/20260610230011_150_require_boarding_transition_reason.sql',
  'utf8'
);

test('no-show to boarded transition requires and records a reason', () => {
  assert.match(
    boardingPage,
    /passenger\.boardingStatus === 'no_show'[\s\S]*status === 'boarded'[\s\S]*setBoardingTransitionPassenger\(passenger\)/
  );
  assert.match(boardingPage, /기존 사유는 수정하거나 삭제하지 않고 보존됩니다/);
  assert.match(boardingPage, /탑승 전환 사유 \(필수\)/);
  assert.match(boardingPage, /전환 사유: \{getStatusChangeReason\(selectedPassengerEvent\)\}/);
  assert.match(boardingService, /p_reason: reason/);
});

test('ordinary boarding transitions remain compatible while the reason RPC rolls out', () => {
  assert.match(boardingService, /isMissingBoardingTransitionReasonRpc/);
  assert.match(
    boardingService,
    /if \(reason\.trim\(\)\) \{[\s\S]*boardingTransitionReasonUpgradeMessage/
  );
  assert.match(
    boardingService,
    /set_passenger_boarding_status', \{\s*p_reservation_id: reservationId,\s*p_status: status,\s*\}/
  );
  assert.match(
    boardingService,
    /set_walk_in_boarding_status', \{\s*p_walk_in_id: passenger\.reservationId,\s*p_status: status,\s*\}/
  );
  assert.doesNotMatch(
    boardingService,
    /legacyError\.message\.includes\('No-show status is available after bus departure'\)/
  );
});

test('server rejects missing transition reasons and preserves them in history', () => {
  assert.match(
    migration,
    /v_current\.boarding_status = 'no_show' and p_status = 'boarded' and v_reason is null/i
  );
  assert.match(migration, /A boarding transition reason is required/i);
  assert.match(migration, /'boarding_status_changed: ' \|\| v_reason/i);
  assert.match(migration, /\[탑승 전환 사유\] ' \|\| v_reason/i);
  assert.match(
    migration,
    /p_status = 'no_show' and v_reason is null and not exists/i
  );
});
