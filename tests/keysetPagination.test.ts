import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const readSource = (path: string) => readFileSync(path, 'utf8');

test('final payment bulk collectors use keyset pagination', () => {
  const source = readSource('src/lib/admin/finalPaymentReviewService.ts');

  assert.match(source, /\.gt\('id', cursorId\)/);
  assert.match(source, /created_at\.lt\.\$\{cursor\.created_at\}/);
  assert.doesNotMatch(source, /\.range\(/);
});

test('allocation workspace reservation collection uses a composite cursor', () => {
  const source = readSource('src/lib/admin/allocationWorkspaceService.ts');

  assert.match(source, /created_at\.gt\.\$\{cursor\.created_at\}/);
  assert.match(source, /\.limit\(ACTIVE_RESERVATION_PAGE_SIZE\)/);
  assert.doesNotMatch(source, /\.range\(/);
});

test('allocation result reservation collection uses a composite cursor', () => {
  const source = readSource('src/pages/admin/AdminAllocationResultPage.tsx');
  const collector = source.slice(
    source.indexOf('const getAllReservationRows = async'),
    source.indexOf('const csvCell')
  );

  assert.match(collector, /created_at\.gt\.\$\{cursor\.created_at\}/);
  assert.match(collector, /id\.gt\.\$\{cursor\.id\}/);
  assert.match(collector, /\.limit\(RESERVATION_FETCH_PAGE_SIZE\)/);
  assert.match(collector, /if \(page\.length < RESERVATION_FETCH_PAGE_SIZE\) return rows/);
  assert.doesNotMatch(collector, /\.range\(/);
});

test('admin ticket bulk collectors use keyset pagination', () => {
  const source = readSource('src/pages/admin/AdminTicketPage.tsx');

  assert.match(source, /created_at\.lt\.\$\{cursor\.created_at\}/);
  assert.match(source, /\.lt\('id', cursorId\)/);
  assert.doesNotMatch(source, /\.range\(/);
});

test('message search uses keyset pagination while numbered request pages remain offset based', () => {
  const source = readSource('src/lib/adminService.ts');
  const messageCollector = source.slice(
    source.indexOf('async function getCampusRequestIdsMatchingMessages'),
    source.indexOf('export async function getCampusRequestsPage')
  );

  assert.match(messageCollector, /created_at\.lt\.\$\{cursor\.created_at\}/);
  assert.match(messageCollector, /\.limit\(pageSize\)/);
  assert.doesNotMatch(messageCollector, /\.range\(/);
  assert.match(source, /\.range\(from, to\)/);
});

test('simulation full-table collectors use primary-key cursors', () => {
  const source = readSource('scripts/simulation.mjs');
  const collector = source.slice(
    source.indexOf('async function fetchAllRows'),
    source.indexOf('async function loadCampusOptions')
  );

  assert.match(collector, /\.order\('id', \{ ascending: true \}\)/);
  assert.match(collector, /\.gt\('id', cursorId\)/);
  assert.match(collector, /\.limit\(PAGE_SIZE\)/);
  assert.doesNotMatch(collector, /\.range\(/);
});

test('simulation runner payment batches use a persisted primary-key cursor', () => {
  const source = readSource('supabase/functions/simulation-runner/index.ts');
  const paymentCollector = source.slice(
    source.indexOf("if (stage === 'reservations' || stage === 'payments')"),
    source.indexOf("if (stage === 'transfers')")
  );

  assert.match(paymentCollector, /\.order\('id', \{ ascending: true \}\)/);
  assert.match(paymentCollector, /\.gt\('id', paymentCursorId\)/);
  assert.match(paymentCollector, /last_reservation_id:/);
  assert.doesNotMatch(paymentCollector, /\.range\(/);
});

test('admin audit logs use cursor queries and cursor navigation', () => {
  const service = readSource('src/lib/admin/adminAuditLogService.ts');
  const page = readSource('src/pages/admin/AdminAuditLogsPage.tsx');

  assert.match(service, /created_at\.lt\.\$\{cursor\.createdAt\}/);
  assert.match(service, /\.limit\(normalizedPageSize \+ 1\)/);
  assert.doesNotMatch(service, /\.range\(/);
  assert.match(page, /cursorHistory/);
  assert.match(page, /showNextPage/);
  assert.doesNotMatch(page, /totalPages|setPage/);
});
