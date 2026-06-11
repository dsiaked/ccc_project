import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const readSource = (path: string) => readFileSync(path, 'utf8');

test('non-critical activity tracking loads after the browser becomes idle', () => {
  const source = readSource('src/App.tsx');

  assert.match(source, /lazy\(\(\) => import\('\.\/components\/ActivityTracker'\)\)/);
  assert.match(source, /requestIdleCallback/);
  assert.match(source, /<DeferredActivityTracker \/>/);
});

test('sidebar data loads in parallel and preloads from user intent', () => {
  const header = readSource('src/components/Header.tsx');
  const sidebar = readSource('src/components/Sidebar.tsx');

  assert.match(header, /const loadSidebar = \(\) => import\('\.\/Sidebar'\)/);
  assert.match(header, /onMouseEnter=\{preloadSidebar\}/);
  assert.match(header, /onFocus=\{preloadSidebar\}/);
  assert.match(
    sidebar,
    /const \[role, roles, reservationResult, profileResult\] = await Promise\.all/
  );
});

test('large admin views use indexed lookups and deferred search', () => {
  const boarding = readSource('src/pages/admin/AdminBoardingPage.tsx');
  const workspace = readSource('src/pages/admin/AdminAllocationWorkspacePage.tsx');
  const passengerTable = readSource(
    'src/pages/admin/components/AllocationPassengerTable.tsx'
  );

  assert.match(boarding, /const busById = useMemo/);
  assert.match(boarding, /const passengerByReservationId = useMemo/);
  assert.match(boarding, /const deferredSearch = useDeferredValue\(search\)/);
  assert.match(workspace, /const deferredBusById = useMemo/);
  assert.doesNotMatch(workspace, /deferredWorkspace\?\.buses\.find/);
  assert.match(passengerTable, /busById\.get\(passenger\.busId\)/);
});

test('administrator role refreshes parallelize deduplicated role requests', () => {
  const provider = readSource('src/components/AdminAuthProvider.tsx');

  assert.match(
    provider,
    /const \[roles, role\] = await Promise\.all\(\[[\s\S]*getAdminRoles\([\s\S]*getAdminRole\(/
  );
});

test('administrator role switches preload routes while revalidating access', () => {
  const header = readSource('src/pages/admin/AdminHeader.tsx');

  assert.match(
    header,
    /Promise\.all\(\[\s*rolePagePreloads\[targetRole\.role\]\(\),\s*switchAdminRole\(roleId\)/
  );
  assert.match(
    header,
    /Promise\.all\(\[\s*rolePagePreloads\[targetRole\.role\]\(\),\s*switchAdminRole\(targetRole\.id\)/
  );
});
