import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const migration = readFileSync(
  'supabase/migrations/20260611000019_185_block_departure_with_unchecked_passengers.sql',
  'utf8'
);
const page = readFileSync('src/pages/admin/AdminBoardingPage.tsx', 'utf8');
const service = readFileSync(
  'src/lib/admin/boardingManagementService.ts',
  'utf8'
);

test('server blocks departure while reservations or walk-ins are unchecked', () => {
  assert.match(migration, /from public\.reservations reservation/i);
  assert.match(migration, /from public\.boarding_walk_in_passengers walk_in/i);
  assert.match(migration, /boarding_status = 'unchecked'/i);
  assert.match(
    migration,
    /Resolve all unchecked passengers before marking departure\./i
  );
  assert.doesNotMatch(migration, /set boarding_status = 'no_show'/i);
  assert.doesNotMatch(migration, /bus_departed_auto_no_show/i);
});

test('boarding UI disables departure until every status is resolved', () => {
  assert.match(page, /if \(counts\.unchecked > 0\)/);
  assert.match(
    page,
    /Boolean\(departureActionKey\) \|\|[\s\S]*unchecked \?\? 0\) > 0/
  );
  assert.match(page, /모든 탑승 상태 확인 · 출발 완료/);
  assert.doesNotMatch(page, /남은 미확인 전원 미탑승 처리 · 출발 완료/);
  assert.match(service, /Resolve all unchecked passengers before marking departure\./);
});
