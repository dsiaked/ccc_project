import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

test('allocation reset serializes job creation and explicitly clears dependencies', () => {
  const migration = readFileSync(
    'supabase/migrations/20260610170001_134_safe_reset_allocation_optimization_jobs.sql',
    'utf8'
  );

  assert.match(
    migration,
    /lock table public\.allocation_optimization_jobs in share row exclusive mode/i
  );
  assert.match(migration, /coalesce\(sum\(status_counts\.job_count\), 0\)::integer/i);
  assert.match(migration, /delete from public\.allocation_optimization_events/i);
  assert.match(
    migration,
    /update public\.allocation_optimization_jobs[\s\S]*source_job_id = null[\s\S]*resume_from_job_id = null/i
  );
  assert.match(
    migration,
    /if to_regclass\('public\.admin_action_audit_logs'\) is not null then[\s\S]*insert into public\.admin_action_audit_logs[\s\S]*'allocation_optimization_jobs'/i
  );
});

test('allocation page prioritizes an active job and explains reset results', () => {
  const page = readFileSync(
    'src/pages/admin/AdminExactAllocationPage.tsx',
    'utf8'
  );
  const service = readFileSync(
    'src/lib/admin/exactAllocationOptimizationService.ts',
    'utf8'
  );

  assert.match(
    page,
    /const activeJob = jobs\.find\(\(job\) => activeStatuses\.has\(job\.status\)\);[\s\S]*const targetJob =\s*activeJob \?\?/
  );
  assert.match(page, /const deletedCount = await resetExactAllocationJobs\(\)/);
  assert.match(page, /계산 기록과 재사용 캐시 \$\{deletedCount\.toLocaleString\(\)\}건을 리셋했습니다/);
  assert.match(service, /진행 중인 계산을 먼저 취소한 뒤 다시 리셋해주세요/);
  assert.match(service, /최신 Supabase 마이그레이션을 적용해주세요/);
  assert.match(
    service,
    /throw new Error\(detail \|\| error\.code \|\| '계산 기록 리셋에 실패했습니다\.'\)/
  );
});

test('successful allocation reset restores the calculation-ready view', () => {
  const page = readFileSync(
    'src/pages/admin/AdminExactAllocationPage.tsx',
    'utf8'
  );

  assert.match(
    page,
    /const resetCalculationView = useCallback\(\(\) => \{[\s\S]*setCurrentJob\(null\);[\s\S]*setRecentJobs\(\[\]\);[\s\S]*setLinkedWorkspace\(null\);[\s\S]*setAllocationName\(''\);[\s\S]*setResumeDetailedBalance\(true\);[\s\S]*setSkippedDetailedPhases\(\[\]\);/
  );
  assert.match(
    page,
    /jobsStateRevisionRef\.current \+= 1;[\s\S]*const deletedCount = await resetExactAllocationJobs\(\);[\s\S]*resetCalculationView\(\);[\s\S]*setCalculationViewReset\(true\);/
  );
  assert.match(
    page,
    /catch \(resetError\) \{[\s\S]*setError\(formatError\(resetError\)\);[\s\S]*await loadRecentJobs\(currentJob\?\.id\)\.catch\(\(\) => undefined\);/
  );
  assert.match(
    page,
    /const requestRevision = jobsStateRevisionRef\.current;[\s\S]*if \(requestRevision !== jobsStateRevisionRef\.current\) return;/
  );
  assert.match(
    page,
    /const activeJob =\s*!calculationViewReset[\s\S]*activeStatuses\.has\(currentJob\.status\);/
  );
  assert.match(
    page,
    /const optimalResult =\s*!calculationViewReset && currentJob\?\.status === 'OPTIMAL'/
  );
  assert.match(
    page,
    /requestRevision === jobsStateRevisionRef\.current[\s\S]*setCalculationViewReset\(false\);[\s\S]*setCurrentJob\(detail\);/
  );
});
