import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const resultPage = readFileSync(
  'src/pages/admin/AdminAllocationResultPage.tsx',
  'utf8'
);
const personalTicketPage = readFileSync(
  'src/pages/admin/AdminPersonalTicketPage.tsx',
  'utf8'
);

test('allocation result loads every reservation with keyset pagination', () => {
  assert.match(resultPage, /const getAllReservationRows = async/);
  assert.match(
    resultPage,
    /\.order\('created_at', \{ ascending: true \}\)\s*\.order\('id', \{ ascending: true \}\)\s*\.limit\(RESERVATION_FETCH_PAGE_SIZE\)/
  );
  assert.match(
    resultPage,
    /created_at\.gt\.\$\{cursor\.created_at\},and\(created_at\.eq\.\$\{cursor\.created_at\},id\.gt\.\$\{cursor\.id\}\)/
  );
  assert.match(resultPage, /getAllReservationRows\(\)/);
});

test('allocation result includes configured buses even when they have no passengers', () => {
  assert.match(
    resultPage,
    /const busNumbers = new Set\(\[\s*\.\.\.routes\.map\(\(route\) => route\.busLabel\),\s*\.\.\.passengersByBus\.keys\(\),\s*\]\)/
  );
  assert.match(resultPage, /const passengers = passengersByBus\.get\(busNumber\) \?\? \[\]/);
});

test('allocation result warnings open the relevant operational detail', () => {
  assert.match(resultPage, /const openWarning = \(warning: AllocationWarning\)/);
  assert.match(resultPage, /onClick=\{\(\) => openWarning\(warning\)\}/);
  assert.match(resultPage, /setPaymentFilter\('attention'\)/);
});

test('allocation result resets destination filtering when changing buses', () => {
  assert.match(
    resultPage,
    /const selectBus = \(busNumber: string\) => \{[\s\S]*setDestinationFilter\('all'\)/
  );
  assert.match(resultPage, /onClick=\{\(\) => selectBus\(bus\.busNumber\)\}/);
});

test('allocation result sends user context to personal ticket management', () => {
  assert.match(resultPage, /\/admin\/users\?search=/);
  assert.match(
    personalTicketPage,
    /const \[searchKeyword, setSearchKeyword\] = useState\(\s*\(\) => searchParams\.get\('search'\) \|\| ''\s*\)/
  );
});
