import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const page = readFileSync(
  'src/pages/admin/AdminCampusAdminManagePage.tsx',
  'utf8'
);

test('campus admin search ignores stale responses after switching targets', () => {
  assert.match(page, /const searchRequestIdRef = useRef\(0\)/);
  assert.match(page, /const requestId = \+\+searchRequestIdRef\.current/);
  assert.match(
    page,
    /searchUsersForCampusManager\(searchParams\)[\s\S]*if \(requestId !== searchRequestIdRef\.current\) return;[\s\S]*setUsers\(result\.users\)/
  );
  assert.match(
    page,
    /finally \{\s*if \(requestId === searchRequestIdRef\.current\) setSearching\(false\)/
  );
});

test('campus admin role mutations block overlapping actions', () => {
  assert.match(page, /const actionInFlightRef = useRef\(false\)/);
  assert.match(
    page,
    /assignUser[\s\S]*actionInFlightRef\.current = true[\s\S]*registerCampusAdmin[\s\S]*actionInFlightRef\.current = false/
  );
  assert.match(
    page,
    /removeAssignment[\s\S]*actionInFlightRef\.current = true[\s\S]*cancelCampusAdmin[\s\S]*actionInFlightRef\.current = false/
  );
  assert.match(page, /disabled=\{isCurrent \|\| isGlobal \|\| Boolean\(actionId\)\}/);
});
