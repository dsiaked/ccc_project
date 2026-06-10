import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const migration = readFileSync(
  'supabase/migrations/20260611000012_182_lock_deadline_while_allocation_confirmed.sql',
  'utf8'
);
const service = readFileSync('src/lib/reservationDeadlineService.ts', 'utf8');
const page = readFileSync(
  'src/pages/admin/AdminReservationDeadlinePage.tsx',
  'utf8'
);

test('confirmed allocations keep the reservation deadline closed on the server', () => {
  assert.match(migration, /v_deadline_at is null or v_deadline_at > clock_timestamp\(\)/i);
  assert.match(migration, /allocation_data ->> 'status' = 'confirmed'/i);
  assert.match(
    migration,
    /pg_advisory_xact_lock\(hashtextextended\('allocation-confirmation', 0\)\)/i
  );
  assert.match(
    migration,
    /Cancel the confirmed allocation before reopening reservations\./i
  );
});

test('deadline admin UI detects confirmed allocations before reopening', () => {
  assert.match(service, /export const hasConfirmedAllocation = async/);
  assert.match(service, /allocation_data->>status/);
  assert.match(page, /hasConfirmedAllocation/);
  assert.match(page, /confirmedAllocationExists && reopensReservations/);
  assert.match(page, /확정 배차를 먼저 취소한 뒤 신청을 다시 열 수 있습니다\./);
});
