import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const deadlineService = readFileSync(
  'src/lib/reservationDeadlineService.ts',
  'utf8'
);
const deadlinePage = readFileSync(
  'src/pages/admin/AdminReservationDeadlinePage.tsx',
  'utf8'
);
const reservationPage = readFileSync('src/pages/ReservationPage.tsx', 'utf8');
const migration = readFileSync(
  'supabase/migrations/20260612000008_203_reservation_opening_lock.sql',
  'utf8'
);

test('reservation deadline setting includes an opening time', () => {
  assert.match(deadlineService, /opens_at\?: string \| null/);
  assert.match(
    deadlineService,
    /p_value:\s*\{[\s\S]*opens_at: normalizedOpensAt,[\s\S]*deadline_at: normalizedDeadlineAt/
  );
  assert.match(deadlinePage, /신청 시작 일시/);
  assert.match(deadlinePage, /시작 잠금 해제/);
});

test('reservation page locks before the opening time', () => {
  assert.match(
    reservationPage,
    /isConfirmed \|\|[\s\S]*reservationDeadline\.isBeforeOpening \|\|[\s\S]*reservationDeadline\.isClosed/
  );
  assert.match(reservationPage, /아직 신청 기간이 시작되지 않았습니다/);
});

test('reservation write RPCs reject requests before opening', () => {
  assert.match(
    migration,
    /create function public\.save_user_reservation\([\s\S]*v_opens_at > clock_timestamp\(\)[\s\S]*Reservation window has not opened yet\./i
  );
  assert.match(
    migration,
    /create function public\.delete_user_reservation\(\)[\s\S]*v_opens_at > clock_timestamp\(\)[\s\S]*Reservation window has not opened yet\./i
  );
  assert.match(
    migration,
    /v_opens_at is not null and v_deadline_at is not null and v_opens_at >= v_deadline_at/i
  );
});
