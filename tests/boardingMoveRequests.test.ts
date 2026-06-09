import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const migration = readFileSync(
  'supabase/migrations/20260610230014_153_boarding_move_requests.sql',
  'utf8'
);
const boardingPage = readFileSync('src/pages/admin/AdminBoardingPage.tsx', 'utf8');
const boardingService = readFileSync(
  'src/lib/admin/boardingManagementService.ts',
  'utf8'
);

test('boarding move requests are RPC-only and prevent duplicate pending requests', () => {
  assert.match(migration, /create table if not exists public\.boarding_move_requests/i);
  assert.match(migration, /where status = 'pending'/i);
  assert.match(
    migration,
    /revoke all on public\.boarding_move_requests from public, anon, authenticated/i
  );
  assert.match(migration, /create or replace function public\.request_boarding_passenger_move/i);
  assert.match(migration, /A pending move request already exists for this passenger/i);
});

test('target bus managers or global admins can approve and execute a pending move', () => {
  assert.match(migration, /create or replace function public\.respond_to_boarding_move_request/i);
  assert.match(
    migration,
    /can_manage_boarding_bus\(v_request\.allocation_id, v_request\.target_bus_id\)/i
  );
  assert.match(
    migration,
    /perform public\.execute_boarding_passenger_move\([\s\S]*v_request\.source_bus_id[\s\S]*v_request\.target_bus_id/i
  );
  assert.match(migration, /The passenger bus changed after the request was created/i);
  assert.match(migration, /Departed buses cannot receive passenger moves/i);
  assert.match(migration, /The target bus has no remaining capacity/i);
});

test('boarding UI requests approval for unmanaged targets and lets target managers respond', () => {
  assert.match(boardingPage, /승인 필요/);
  assert.match(boardingPage, /이동 승인 요청/);
  assert.match(boardingPage, /승인 · 이동 처리/);
  assert.match(boardingPage, /거절 사유를 입력해주세요/);
  assert.match(boardingService, /request_boarding_passenger_move/);
  assert.match(boardingService, /respond_to_boarding_move_request/);
  assert.match(boardingService, /get_boarding_move_request_snapshot/);
});
