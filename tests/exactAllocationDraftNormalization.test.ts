import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const migration = readFileSync(
  'sql/setup/139_fix_allocation_draft_reservation_normalization.sql',
  'utf8'
);

test('allocation draft validation uses the optimizer reservation normalization', () => {
  assert.match(
    migration,
    /nullif\(reservation\.team, ''\),\s*case when reservation\.affiliation_type = 'external' then '-' end/
  );
  assert.match(
    migration,
    /where reservation\.status is distinct from 'cancelled'\s*and not coalesce\(reservation\.data \? 'remainingSeatClaim', false\)/
  );
});
