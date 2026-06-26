import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const personalTicketPage = readFileSync(
  'src/pages/admin/AdminPersonalTicketPage.tsx',
  'utf8'
);
const personalTicketMigration = readFileSync(
  'supabase/migrations/20260627000003_239_allow_destination_queue_personal_ticket_updates.sql',
  'utf8'
);

test('personal ticket management treats destination queue tickets as destination-only', () => {
  assert.match(
    personalTicketPage,
    /isDestinationQueueAllocation[\s\S]*allocationStrategy === 'destination_queue'/
  );
  assert.match(
    personalTicketPage,
    /if \(isDestinationQueueAllocation\)[\s\S]*확정 행선지를 입력[\s\S]*else if \(!busNumber \|\| !seatNumber\)/
  );
  assert.match(
    personalTicketPage,
    /allocationStrategy: isDestinationQueueAllocation[\s\S]*'destination_queue'[\s\S]*busNumber: isDestinationQueueAllocation \? '' : busNumber/
  );
  assert.match(
    personalTicketPage,
    /value=\{isDestinationQueueAllocation \? '좌석 미지정' : draft\.seatNumber\}[\s\S]*disabled=\{isDestinationQueueAllocation\}/
  );
});

test('admin personal-ticket rpc allows destination queue updates without bus seats', () => {
  assert.match(
    personalTicketMigration,
    /v_is_destination_queue[\s\S]*p_ticket ->> 'allocationStrategy'[\s\S]*'destination_queue'/
  );
  assert.match(
    personalTicketMigration,
    /if v_is_destination_queue then[\s\S]*v_assigned_destination[\s\S]*assignedDestination[\s\S]*'busId', null[\s\S]*'seatNumber', null/
  );
  assert.match(
    personalTicketMigration,
    /else[\s\S]*A valid bus and seat number are required[\s\S]*v_seat_number/
  );
});
