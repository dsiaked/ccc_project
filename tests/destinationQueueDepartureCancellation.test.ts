import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const migration = readFileSync(
  'supabase/migrations/20260621000001_234_cancel_destination_queue_departure.sql',
  'utf8'
);
const panel = readFileSync(
  'src/pages/admin/DestinationQueueBoardingPanel.tsx',
  'utf8'
);
const service = readFileSync(
  'src/lib/admin/boardingManagementService.ts',
  'utf8'
);

test('only global admins can cancel destination queue departures', () => {
  assert.match(migration, /if not public\.is_global_admin\(\)/i);
  assert.match(
    migration,
    /later_bus\.sequence_number > v_bus\.sequence_number/i
  );
  assert.match(
    migration,
    /delete from public\.destination_queue_departure_snapshots/i
  );
  assert.match(migration, /'cancel_departure'/);
});

test('departure cancellation restores a safe operating state', () => {
  assert.match(migration, /when v_boarded_count >= v_bus\.capacity then 'full'/i);
  assert.match(migration, /then lpad\(floor\(random\(\) \* 10000\)/i);
  assert.match(migration, /departed_at = null/i);
  assert.match(migration, /departed_by = null/i);
});

test('global admin UI requires a cancellation reason', () => {
  assert.match(panel, /isGlobalAdmin &&/);
  assert.match(panel, /departureCancellationReason\.trim\(\)/);
  assert.match(panel, /출발 취소/);
  assert.match(service, /cancel_destination_queue_departure/);
  assert.match(service, /p_reason: reason/);
});
