import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const setupSql = readFileSync(
  'sql/setup/176_allocation_optimization_retention.sql',
  'utf8',
);
const migrationSql = readFileSync(
  'sql/setup/176_allocation_optimization_retention.sql',
  'utf8',
);

test('allocation optimization retention setup matches its migration', () => {
  assert.equal(setupSql, migrationSql);
});

test('allocation optimization retention keeps recent and active jobs', () => {
  assert.match(setupSql, /requested_at >= now\(\) - interval '90 days'/i);
  assert.match(
    setupSql,
    /status in \('PENDING', 'RUNNING', 'CANCEL_REQUESTED'\)/i,
  );
});

test('allocation optimization retention keeps the latest five optimal results', () => {
  assert.match(
    setupSql,
    /where job\.status = 'OPTIMAL'[\s\S]*order by job\.completed_at desc nulls last[\s\S]*limit 5/i,
  );
});

test('allocation optimization retention recursively protects job dependencies', () => {
  assert.match(setupSql, /with recursive retained_jobs\(id\)/i);
  assert.match(setupSql, /retained_job\.source_job_id/i);
  assert.match(setupSql, /retained_job\.resume_from_job_id/i);
});

test('allocation optimization retention runs automatically after inserts', () => {
  assert.match(
    setupSql,
    /create trigger prune_allocation_optimization_jobs_after_insert[\s\S]*after insert on public\.allocation_optimization_jobs[\s\S]*for each statement/i,
  );
  assert.match(
    setupSql,
    /grant execute on function public\.prune_allocation_optimization_jobs\(\)\s+to service_role/i,
  );
  assert.doesNotMatch(
    setupSql,
    /grant execute on function public\.prune_allocation_optimization_jobs\(\)\s+to authenticated/i,
  );
});
