import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const exactAllocationPage = readFileSync(
  'src/pages/admin/AdminExactAllocationPage.tsx',
  'utf8'
);
const workspacePage = readFileSync(
  'src/pages/admin/AdminAllocationWorkspacePage.tsx',
  'utf8'
);
const workspaceService = readFileSync(
  'src/lib/admin/allocationWorkspaceService.ts',
  'utf8'
);
const destinationQueueEditor = readFileSync(
  'src/pages/admin/DestinationQueueWorkspaceEditor.tsx',
  'utf8'
);
const cancellationMigration = readFileSync(
  'supabase/migrations/20260615000002_223_cancel_destination_queue_allocation.sql',
  'utf8'
);

test('destination queue selection converts new and already-linked draft workspaces', () => {
  assert.match(
    exactAllocationPage,
    /allocationStrategy === 'destination_queue'[\s\S]*convertAllocationWorkspaceToDestinationQueue\(row\)/
  );
  assert.match(
    exactAllocationPage,
    /const handleOpenLinkedWorkspace[\s\S]*allocationStrategy === 'destination_queue'[\s\S]*convertAllocationWorkspaceToDestinationQueue\(existing\)/
  );
  assert.doesNotMatch(
    exactAllocationPage,
    /catch \(draftError\)[\s\S]*navigate\(`\/admin\/allocations\/workspace\?id=\$\{existing\.id\}`\)/
  );
});

test('destination queue workspaces skip legacy bus-and-seat passenger refresh', () => {
  assert.match(
    workspacePage,
    /lockResult\.row\.allocation_data\.allocationStrategy !==\s*'destination_queue'[\s\S]*refreshDraftWorkspacePassengers/
  );
  assert.match(
    workspacePage,
    /workspace\.allocationStrategy === 'destination_queue'[\s\S]*DestinationQueueWorkspaceEditor/
  );
});

test('destination queue conversion acquires its own edit lock before saving', () => {
  assert.match(
    workspaceService,
    /convertAllocationWorkspaceToDestinationQueue[\s\S]*acquireAllocationWorkspaceLock\(row\.id\)[\s\S]*const lockedRow = lockResult\.row[\s\S]*saveAllocationWorkspace\(\s*lockedRow/
  );
});

test('confirmed destination queue workspaces expose safe allocation cancellation', () => {
  assert.match(
    destinationQueueEditor,
    /cancelConfirmedWorkspace\(row, workspace, session\.user\.id\)[\s\S]*readOnly[\s\S]*배차 확정 취소/
  );
  assert.match(
    workspaceService,
    /workspace\.allocationStrategy === 'destination_queue'[\s\S]*cancel_destination_queue_allocation/
  );
  assert.match(
    cancellationMigration,
    /status = 'departed'[\s\S]*Departed destination queue buses prevent allocation cancellation/
  );
  assert.match(
    cancellationMigration,
    /cancel_confirmed_allocation_workspace_v2[\s\S]*delete from public\.destination_queue_buses/
  );
  assert.match(
    cancellationMigration,
    /require_confirmed_destination_queue_allocation[\s\S]*for key share[\s\S]*before insert on public\.destination_queue_buses/
  );
});
