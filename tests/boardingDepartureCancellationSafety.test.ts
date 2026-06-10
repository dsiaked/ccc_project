import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const page = readFileSync('src/pages/admin/AdminBoardingPage.tsx', 'utf8');
const service = readFileSync(
  'src/lib/admin/boardingManagementService.ts',
  'utf8'
);
const migration = readFileSync(
  'supabase/migrations/20260611000011_181_require_boarding_departure_cancel_reason.sql',
  'utf8'
);

test('departure cancellation uses a reason modal and explains restored passengers', () => {
  assert.match(page, /출발 완료 취소 사유 \(필수\)/);
  assert.match(page, /자동 미탑승 \{departureCancellationRestoreCount\.toLocaleString\(\)\}명 복구/);
  assert.match(page, /사유 기록 · 출발 완료 취소/);
  assert.match(page, /!departureCancelReason\.trim\(\)/);
  assert.doesNotMatch(
    page,
    /handleCancelDeparture[\s\S]*window\.confirm\([\s\S]*일괄 미탑승 처리된 탑승자는/
  );
});

test('departure cancellation sends and stores a required reason', () => {
  assert.match(service, /cancelBoardingBusDeparture = async \(busId: string, reason: string\)/);
  assert.match(service, /p_reason: reason/);
  assert.match(migration, /add column if not exists cancellation_reason text/i);
  assert.match(migration, /A departure cancellation reason is required/i);
  assert.match(migration, /cancellation_reason = v_reason/i);
  assert.match(migration, /bus_departure_cancelled_auto_restore: ' \|\| v_reason/i);
  assert.match(migration, /returns integer/i);
});

test('assigned field boarding managers can cancel departure', () => {
  assert.match(
    migration,
    /if not public\.is_boarding_manager\(\) then[\s\S]*Only boarding managers can cancel departure\./i
  );
  assert.match(
    migration,
    /if not public\.can_manage_boarding_bus\(v_departure\.allocation_id, p_bus_id\) then[\s\S]*You are not assigned to this bus\./i
  );
  assert.doesNotMatch(migration, /if not public\.is_global_admin\(\)/i);
});
