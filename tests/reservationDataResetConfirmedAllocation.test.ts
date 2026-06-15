import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const migration = readFileSync(
  'supabase/migrations/20260615000003_224_allow_confirmed_allocation_data_reset.sql',
  'utf8'
);

test('global-admin data reset can delete confirmed allocations without unlocking normal planning writes', () => {
  const resetBody =
    migration.match(
      /function public\.reset_reservation_data\([\s\S]*?as \$\$([\s\S]*?)\$\$;/
    )?.[1] ?? '';

  assert.match(
    resetBody,
    /if p_reset_bus_allocations then[\s\S]*set_config\('app\.allocation_confirmation_write', 'on', true\)[\s\S]*end if;/i
  );
  assert.match(
    resetBody,
    /if p_reset_bus_allocations then[\s\S]*delete from bus_allocations where true;/i
  );
  assert.doesNotMatch(migration, /create or replace function public\.lock_allocation_planning_writes/i);
});
