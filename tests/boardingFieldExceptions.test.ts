import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const migration = readFileSync(
  'sql/setup/140_boarding_field_exceptions.sql',
  'utf8'
);
const boardingPage = readFileSync('src/pages/admin/AdminBoardingPage.tsx', 'utf8');
const boardingService = readFileSync(
  'src/lib/admin/boardingManagementService.ts',
  'utf8'
);

test('boarding field exceptions are limited to boarding managers assigned to the buses', () => {
  assert.match(migration, /create table if not exists public\.boarding_walk_in_passengers/i);
  assert.match(migration, /create or replace function public\.move_boarding_passenger_as_global_admin/i);
  assert.match(migration, /create or replace function public\.add_boarding_walk_in_as_global_admin/i);
  assert.match(migration, /Only boarding managers can move boarding passengers/i);
  assert.match(migration, /Only boarding managers can add walk-in passengers/i);
  assert.match(
    migration,
    /can_manage_boarding_bus\(v_allocation\.id, v_source_bus_id\)[\s\S]*You are not assigned to the source bus/i
  );
  assert.match(
    migration,
    /can_manage_boarding_bus\(v_allocation\.id, p_target_bus_id\)[\s\S]*You are not assigned to the target bus/i
  );
  assert.match(
    migration,
    /can_manage_boarding_bus\(v_allocation\.id, p_bus_id\)[\s\S]*You are not assigned to this bus/i
  );
  assert.match(migration, /Departed buses cannot receive passenger moves/i);
  assert.match(migration, /Departed buses cannot receive walk-in passengers/i);
  assert.match(migration, /The selected seat number is already assigned/i);
  assert.match(migration, /create trigger validate_boarding_walk_in_seat_conflicts/i);
  assert.match(migration, /Confirmed allocation conflicts with a walk-in passenger seat/i);
});

test('moving a passenger resets boarding state and keeps allocation in sync', () => {
  assert.match(migration, /where passenger\.value ->> 'reservationId' <> p_reservation_id::text/i);
  assert.match(migration, /from generate_series\(1, \(v_target_bus ->> 'capacity'\)::integer\)/i);
  assert.match(migration, /order by candidate\.seat_number[\s\S]*limit 1/i);
  assert.match(migration, /The target bus has no remaining capacity/i);
  assert.match(migration, /boarding_status = 'unchecked'/i);
  assert.match(migration, /'boarding_bus_moved'/i);
});

test('departure actions include walk-in passengers', () => {
  assert.match(
    migration,
    /update public\.boarding_walk_in_passengers[\s\S]*boarding_status = 'no_show'/i
  );
  assert.match(
    migration,
    /update public\.boarding_walk_in_passengers[\s\S]*boarding_status = 'unchecked'/i
  );
});

test('boarding page exposes walk-in and bus-move actions to boarding managers', () => {
  assert.match(boardingPage, /현장 탑승 추가/);
  assert.match(boardingPage, /다른 호차로 이동/);
  assert.match(boardingPage, /\{!isGlobalSearch && \(/);
  assert.match(boardingPage, /\{selectedPassenger\.passengerKind !== 'walk_in' && \(/);
  assert.match(boardingPage, /\{exceptionMode && snapshot && \(/);
  assert.match(boardingService, /add_boarding_walk_in_as_global_admin/);
  assert.match(boardingService, /move_boarding_passenger_as_global_admin/);
});

test('boarding move UI shows remaining capacity and delegates roster number assignment', () => {
  assert.match(boardingPage, /대상 호차 잔여 인원/);
  assert.match(boardingPage, /잔여 \{remaining\}명/);
  assert.match(boardingPage, /비어 있는 명단 번호가 자동으로 배정됩니다/);
  assert.match(
    boardingPage,
    /moveBoardingPassenger\(\s*exceptionPassenger\.reservationId,\s*exceptionBusId,\s*exceptionReason\.trim\(\)\s*\)/
  );
  assert.doesNotMatch(
    boardingService,
    /moveBoardingPassenger[\s\S]*?p_seat_number:\s*seatNumber/
  );
});
