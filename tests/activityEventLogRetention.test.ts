import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const setupSql = readFileSync(
  'sql/setup/178_activity_event_log_retention.sql',
  'utf8',
);
const migrationSql = readFileSync(
  'supabase/migrations/20260611000008_178_activity_event_log_retention.sql',
  'utf8',
);

test('activity event log retention setup matches its migration', () => {
  assert.equal(setupSql, migrationSql);
});

test('activity event log retention deletes only logs older than ninety days', () => {
  assert.match(
    setupSql,
    /delete from public\.activity_event_logs activity[\s\S]*activity\.occurred_at < now\(\) - interval '90 days'/i,
  );
});

test('activity event log retention runs at most once per day after inserts', () => {
  assert.match(setupSql, /pg_try_advisory_xact_lock\(hashtext\('activity_event_logs_retention'\)\)/i);
  assert.match(setupSql, /key = 'activity_event_log_retention'/i);
  assert.match(setupSql, /last_pruned_on/i);
  assert.match(
    setupSql,
    /create trigger prune_activity_event_logs_daily[\s\S]*after insert on public\.activity_event_logs[\s\S]*for each statement/i,
  );
});

test('activity event log pruning is service-role only', () => {
  assert.match(
    setupSql,
    /grant execute on function public\.prune_activity_event_logs\(\)\s+to service_role/i,
  );
  assert.doesNotMatch(
    setupSql,
    /grant execute on function public\.prune_activity_event_logs\(\)\s+to authenticated/i,
  );
});
