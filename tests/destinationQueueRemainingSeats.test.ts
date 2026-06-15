import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  getDestinationQueueRemainingSeatCount,
  getDestinationQueueRemainingSeatId,
  isDestinationQueueRemainingSeatId,
} from '../src/lib/admin/destinationQueueAllocation.js';

const migration = readFileSync(
  'supabase/migrations/20260616000003_228_destination_queue_remaining_seats.sql',
  'utf8'
);
const adminPage = readFileSync(
  'src/pages/admin/AdminRemainingSeatSalesPage.tsx',
  'utf8'
);

test('destination queue remaining seats use the final expected bus capacity', () => {
  assert.equal(getDestinationQueueRemainingSeatCount(43), 1);
  assert.equal(getDestinationQueueRemainingSeatCount(44), 0);
  assert.equal(getDestinationQueueRemainingSeatCount(45), 43);
  assert.equal(getDestinationQueueRemainingSeatCount(88), 0);
});

test('destination queue remaining seat ids are stable per destination', () => {
  const id = getDestinationQueueRemainingSeatId(' 고속터미널역 ');
  assert.equal(id, 'destination_queue:고속터미널역');
  assert.equal(isDestinationQueueRemainingSeatId(id), true);
  assert.equal(isDestinationQueueRemainingSeatId('bus-1'), false);
});

test('remaining seat RPCs support destination queue claims without preassigned buses', () => {
  assert.match(
    migration,
    /allocation_data ->> 'allocationStrategy' = 'destination_queue'[\s\S]*queue\.passenger_count % 44 <> 0/
  );
  assert.match(
    migration,
    /v_is_destination_queue[\s\S]*'assignedDestination'[\s\S]*case when v_is_destination_queue then v_destination else null end/
  );
  assert.match(
    migration,
    /'allocationStrategy', case when v_is_destination_queue then 'destination_queue' else 'preassigned_bus' end/
  );
  assert.match(
    migration,
    /v_ticket := jsonb_build_object\([\s\S]*'busNumber', case when v_is_destination_queue then ''/
  );
});

test('remaining seat admin exposes destination queue destinations as virtual buses', () => {
  assert.match(
    adminPage,
    /allocationStrategy === 'destination_queue'[\s\S]*getDestinationQueueStats/
  );
  assert.match(
    adminPage,
    /getDestinationQueueRemainingSeatId\(destination\.destination\)[\s\S]*현장 호차 배정/
  );
});
