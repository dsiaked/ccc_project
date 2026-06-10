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
    /\.from\('allocation_optimization_jobs'\)[\s\S]*status: 'FAILED'[\s\S]*current_phase: 'launcher_failed'[\s\S]*error_message: errorMessage[\s\S]*\.eq\('status', 'PENDING'\)[\s\S]*\.eq\('worker_id', workerId\)/
  );
  assert.match(
    source,
    /event_type: 'CLOUD_RUN_EXECUTION_REQUEST_FAILED'[\s\S]*message: errorMessage/
  );
});

test('cloud launcher atomically claims a pending job before starting Cloud Run', () => {
  const source = readFileSync(
    'supabase/functions/allocation-optimizer-launcher/index.ts',
    'utf8'
  );

  assert.match(
    source,
    /const workerId = `cloud-run-\$\{crypto\.randomUUID\(\)\}`[\s\S]*current_phase: 'launcher_claimed'[\s\S]*\.eq\('status', 'PENDING'\)[\s\S]*\.eq\('execution_mode', 'cloud'\)[\s\S]*\.is\('worker_id', null\)[\s\S]*\.select\('id'\)[\s\S]*\.maybeSingle\(\)/
  );
  assert.match(source, /if \(!claimedJob\)[\s\S]*already being launched/);
});

test('cloud launcher recovers a stale pending claim after an interrupted launch', () => {
  const source = readFileSync(
    'supabase/functions/allocation-optimizer-launcher/index.ts',
    'utf8'
  );

  assert.match(source, /const LAUNCHER_CLAIM_TIMEOUT_MS = 5 \* 60_000/);
  assert.match(
    source,
    /staleClaimBefore[\s\S]*worker_id: null[\s\S]*current_phase: null[\s\S]*\.eq\('status', 'PENDING'\)[\s\S]*\.eq\('execution_mode', 'cloud'\)[\s\S]*\.eq\('current_phase', 'launcher_claimed'\)[\s\S]*\.lt\('updated_at', staleClaimBefore\)/
  );
  assert.match(source, /if \(staleClaimError\)[\s\S]*claim recovery failed/);
});

test('cloud launcher never retries an execution whose acceptance is unknown', () => {
  const source = readFileSync(
    'supabase/functions/allocation-optimizer-launcher/index.ts',
    'utf8'
  );

  assert.match(source, /launchRequestStarted = true;[\s\S]*await fetch/);
  assert.match(
    source,
    /launchRequestStarted[\s\S]*status: 'FAILED'[\s\S]*current_phase: 'launcher_status_unknown'/
  );
  assert.match(source, /중복 실행을 막기 위해 자동 재시도를 중단/);
});
