import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const setupSql = readFileSync(
  'sql/setup/144_expire_stale_allocation_optimization_jobs.sql',
  'utf8',
);
const migrationSql = readFileSync(
  'supabase/migrations/20260610230005_144_expire_stale_allocation_optimization_jobs.sql',
  'utf8',
);

test('stale optimizer recovery setup SQL matches its migration', () => {
  assert.equal(setupSql, migrationSql);
});

test('stale optimizer recovery expires only inactive claimed jobs', () => {
  assert.match(
    setupSql,
    /where status in \('RUNNING', 'CANCEL_REQUESTED'\)/i,
  );
  assert.match(
    setupSql,
    /updated_at < now\(\) - make_interval\(secs => p_stale_after_seconds\)/i,
  );
  assert.match(setupSql, /status = 'FAILED'/i);
  assert.match(setupSql, /JOB_HEARTBEAT_EXPIRED/i);
  assert.match(
    setupSql,
    /grant execute on function public\.expire_stale_allocation_optimization_jobs\(integer\)\s+to service_role/i,
  );
  assert.doesNotMatch(
    setupSql,
    /grant execute on function public\.expire_stale_allocation_optimization_jobs\(integer\)\s+to authenticated/i,
  );
});
