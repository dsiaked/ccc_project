import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const setupSql = readFileSync(
  'sql/setup/177_allocation_workspace_version_retention.sql',
  'utf8',
);
const migrationSql = readFileSync(
  'supabase/migrations/20260611000007_177_allocation_workspace_version_retention.sql',
  'utf8',
);

test('allocation workspace version retention setup matches its migration', () => {
  assert.equal(setupSql, migrationSql);
});

test('allocation workspace version retention keeps recent versions and twenty per workspace', () => {
  assert.match(
    setupSql,
    /partition by version\.allocation_id[\s\S]*order by version\.created_at desc, version\.id desc/i,
  );
  assert.match(setupSql, /ranked\.recent_rank > 20/i);
  assert.match(
    setupSql,
    /version\.created_at < now\(\) - interval '90 days'/i,
  );
});

test('workspace version storage prunes only the saved workspace', () => {
  assert.match(
    setupSql,
    /perform public\.prune_allocation_workspace_versions\(p_allocation_id\)/i,
  );
  assert.doesNotMatch(setupSql, /offset 20/i);
});

test('workspace version pruning is service-role only', () => {
  assert.match(
    setupSql,
    /grant execute on function public\.prune_allocation_workspace_versions\(uuid\)\s+to service_role/i,
  );
  assert.doesNotMatch(
    setupSql,
    /grant execute on function public\.prune_allocation_workspace_versions\(uuid\)\s+to authenticated/i,
  );
});
