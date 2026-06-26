import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const migration = readFileSync(
  'supabase/migrations/20260627000001_237_include_remaining_seat_claims_in_optimization.sql',
  'utf8'
);

test('allocation optimization includes remaining-seat claims in reservation normalization', () => {
  assert.match(
    migration,
    /nullif\(reservation\.team, ''\),\s*case when reservation\.affiliation_type = 'external' then '-' end/
  );
  assert.match(
    migration,
    /create or replace function public\.get_allocation_optimization_reservations\(\)/
  );
  assert.match(
    migration,
    /'schema_version', 1,/
  );
  assert.match(
    migration,
    /active\.remaining_claim ->> 'destination'/
  );
  assert.match(
    migration,
    /snapshot\.source <> 'remaining_seat'\s*and snapshot\.first_choice = snapshot\.second_choice/
  );
  assert.match(
    migration,
    /'source', passenger ->> 'source'/
  );
  assert.match(
    migration,
    /'remainingSeatStatus', passenger ->> 'remaining_seat_status'/
  );
  assert.match(
    migration,
    /when passenger ->> 'source' = 'remaining_seat'\s*then jsonb_build_array\(passenger ->> 'first_choice'\)/
  );
  assert.doesNotMatch(
    migration,
    /and not coalesce\(reservation\.data \? 'remainingSeatClaim', false\)/
  );
});
