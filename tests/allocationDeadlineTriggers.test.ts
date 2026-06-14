import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

test('allocation deadline triggers use functions matching each table row shape', () => {
  const migration = readFileSync(
    'sql/setup/135_split_allocation_deadline_triggers.sql',
    'utf8'
  );
  const optimizationJobFunction =
    migration.match(
      /function public\.require_closed_reservation_deadline_for_optimization_job\(\)([\s\S]*?)\$\$;/
    )?.[1] ?? '';

  assert.match(optimizationJobFunction, /return new;/i);
  assert.doesNotMatch(optimizationJobFunction, /allocation_data/i);
  assert.match(
    migration,
    /function public\.require_closed_reservation_deadline_for_bus_allocation\(\)[\s\S]*new\.allocation_data/i
  );
  assert.match(
    migration,
    /before insert on public\.allocation_optimization_jobs[\s\S]*require_closed_reservation_deadline_for_optimization_job\(\)/i
  );
  assert.match(
    migration,
    /before insert or update on public\.bus_allocations[\s\S]*require_closed_reservation_deadline_for_bus_allocation\(\)/i
  );
});

test('allocation planning assertion is a normal void function', () => {
  const migration = readFileSync(
    'sql/setup/135_split_allocation_deadline_triggers.sql',
    'utf8'
  );
  const assertionBody =
    migration.match(
      /function public\.assert_allocation_planning_unlocked\(\)([\s\S]*?)\$\$;/
    )?.[1] ?? '';

  assert.match(assertionBody, /returns void/i);
  assert.doesNotMatch(assertionBody, /\btg_op\b|\bnew\b|\bold\b/i);
});

test('confirmed allocation cancellation remains available before the deadline', () => {
  const migration = readFileSync(
    'sql/setup/158_allow_allocation_confirmation_cancel_before_deadline.sql',
    'utf8'
  );
  const triggerFunction =
    migration.match(
      /function public\.require_closed_reservation_deadline_for_bus_allocation\(\)([\s\S]*?)\$\$;/
    )?.[1] ?? '';

  assert.match(
    triggerFunction,
    /tg_op = 'UPDATE'[\s\S]*old\.allocation_data ->> 'status' = 'confirmed'[\s\S]*new\.allocation_data ->> 'status' = 'draft'[\s\S]*return new;/i
  );
  assert.match(
    triggerFunction,
    /if v_deadline_at is null or v_deadline_at > clock_timestamp\(\) then[\s\S]*raise exception 'Allocation is available only after the reservation deadline\.'/i
  );
});
