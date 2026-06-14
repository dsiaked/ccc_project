import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const page = readFileSync(
  'src/pages/admin/AdminAllocationWorkspacePage.tsx',
  'utf8'
);
const service = readFileSync(
  'src/lib/admin/allocationWorkspaceService.ts',
  'utf8'
);
const migration = readFileSync(
  'sql/setup/183_block_allocation_cancel_after_departure.sql',
  'utf8'
);

test('departed buses block confirmed allocation cancellation on the server', () => {
  assert.match(migration, /old\.allocation_data ->> 'status' = 'confirmed'/i);
  assert.match(migration, /new\.allocation_data ->> 'status' <> 'confirmed'/i);
  assert.match(migration, /departure\.cancelled_at is null/i);
  assert.match(
    migration,
    /Cancel all bus departures before cancelling the confirmed allocation\./i
  );
  assert.match(migration, /before update of allocation_data on public\.bus_allocations/i);
});

test('allocation workspace disables cancellation while buses are departed', () => {
  assert.match(service, /export const getActiveDepartureCount = async/);
  assert.match(service, /\.from\('boarding_bus_departures'\)/);
  assert.match(page, /activeDepartureCount > 0/);
  assert.match(page, /disabled=\{saving \|\| activeDepartureCount > 0\}/);
  assert.match(page, /출발 완료를 먼저 모두\s*취소해주세요\./);
});
