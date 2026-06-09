import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const workspacePage = readFileSync(
  'src/pages/admin/AdminAllocationWorkspacePage.tsx',
  'utf8'
);
const passengerTable = readFileSync(
  'src/pages/admin/components/AllocationPassengerTable.tsx',
  'utf8'
);
const workspaceStyles = readFileSync(
  'src/pages/admin/AdminAllocationWorkspacePage.module.css',
  'utf8'
);

test('dirty workspace navigation asks before leaving through explicit page links', () => {
  assert.match(
    workspacePage,
    /const navigateToAllocations = useCallback\(\(\) => \{[\s\S]*if \(dirty\) \{[\s\S]*setLeaveWorkspaceDialogOpen\(true\)[\s\S]*navigate\('\/admin\/allocations'\)/
  );
  assert.match(
    workspacePage,
    /const confirmNavigateToAllocations = useCallback\(\(\) => \{[\s\S]*navigate\('\/admin\/allocations'\)/
  );
  assert.match(workspacePage, /onClick=\{navigateToAllocations\}/);
  assert.match(workspacePage, /onClick=\{confirmNavigateToAllocations\}/);
  assert.doesNotMatch(workspacePage, /window\.confirm/);
});

test('read-only workspace disables real controls and guards mutations', () => {
  assert.match(
    workspacePage,
    /const updateWorkspace = useCallback\([\s\S]*if \(readOnly\) return;/
  );
  assert.match(workspacePage, /<input disabled=\{readOnly\} value=\{selectedBus\.label\}/);
  assert.match(workspacePage, /<select disabled=\{readOnly\} value=\{selectedBus\.destination\}/);
  assert.match(workspacePage, /readOnly=\{readOnly\}[\s\S]*onAssign=\{assignPassenger\}/);
  assert.match(passengerTable, /draggable=\{!readOnly && !remainingSeat\}/);
  assert.match(passengerTable, /disabled=\{readOnly \|\| remainingSeat\}/);
  assert.match(
    passengerTable,
    /disabled=\{readOnly \|\| !passenger\.busId \|\| remainingSeat\}/
  );
  assert.doesNotMatch(workspaceStyles, /\.readOnly\s*\{[^}]*pointer-events:\s*none/);
});

test('seat input and update handler limit seats to the assigned bus capacity', () => {
  assert.match(passengerTable, /max=\{assignedBus\?\.capacity\}/);
  assert.match(
    workspacePage,
    /Math\.min\(bus\.capacity, Math\.max\(1, Math\.trunc\(seatNumber\)\)\)/
  );
});
