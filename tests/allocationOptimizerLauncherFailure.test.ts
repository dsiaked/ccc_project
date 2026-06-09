import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

test('cloud launcher failures finish pending jobs so reset is not blocked', () => {
  const source = readFileSync(
    'supabase/functions/allocation-optimizer-launcher/index.ts',
    'utf8'
  );

  assert.match(
    source,
    /\.from\('allocation_optimization_jobs'\)[\s\S]*status: 'FAILED'[\s\S]*current_phase: 'launcher_failed'[\s\S]*error_message: errorMessage[\s\S]*\.eq\('status', 'PENDING'\)/
  );
  assert.match(
    source,
    /event_type: 'CLOUD_RUN_EXECUTION_REQUEST_FAILED'[\s\S]*message: errorMessage/
  );
});
