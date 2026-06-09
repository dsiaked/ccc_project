import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const setupSql = readFileSync(
  'sql/setup/146_rate_limit_boarding_check_in_codes.sql',
  'utf8',
);
const migrationSql = readFileSync(
  'supabase/migrations/20260610230007_146_rate_limit_boarding_check_in_codes.sql',
  'utf8',
);
const reservationService = readFileSync('src/lib/reservationService.ts', 'utf8');

test('boarding check-in rate limit setup SQL matches its migration', () => {
  assert.equal(setupSql, migrationSql);
});

test('boarding check-in locks each reservation after five failures', () => {
  assert.match(setupSql, /primary key \(allocation_id, reservation_id\)/i);
  assert.match(setupSql, /for update;/i);
  assert.match(setupSql, /v_attempt\.failed_attempts \+ 1/i);
  assert.match(setupSql, /when v_failed_attempts >= 5 then v_now \+ interval '15 minutes'/i);
  assert.match(setupSql, /v_attempt\.locked_until > v_now/i);
  assert.match(setupSql, /delete from public\.boarding_check_in_attempts/i);
  assert.match(setupSql, /alter table public\.boarding_check_in_attempts enable row level security/i);
  assert.match(setupSql, /revoke all on table public\.boarding_check_in_attempts/i);
});

test('boarding check-in service handles structured rate-limit responses', () => {
  assert.match(reservationService, /if \(typeof data === 'string'\) return data;/);
  assert.match(reservationService, /if \(!result\.success\)/);
  assert.match(reservationService, /throw new Error\(result\.message/);
  assert.match(reservationService, /return result\.confirmedAt;/);
});
