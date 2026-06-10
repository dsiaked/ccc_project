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

test('latest allocation reset relies on cascade cleanup and exposes unexpected database errors', () => {
  const migration = readFileSync(
    'supabase/migrations/20260610230025_161_diagnose_allocation_optimization_reset.sql',
    'utf8'
  );

  assert.doesNotMatch(migration, /delete from public\.allocation_optimization_events/i);
  assert.match(migration, /delete from public\.allocation_optimization_jobs/i);
  assert.match(
    migration,
    /Allocation optimization reset failed \[%\]: %[\s\S]*sqlstate, sqlerrm/i
  );
});

test('guarded allocation reset uses an explicit full-history predicate', () => {
  const migration = readFileSync(
    'supabase/migrations/20260610230027_163_fix_guarded_allocation_optimization_reset.sql',
    'utf8'
  );

  assert.match(
    migration,
    /delete from public\.allocation_optimization_jobs\s+where id is not null/i
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
    /catch \(resetError\) \{[\s\S]*setResetDialogError\(formatResetError\(resetError\)\);[\s\S]*await loadRecentJobs\(currentJob\?\.id\)\.catch\(\(\) => undefined\);/
  );
  assert.match(
    page,
    /const requestRevision = jobsStateRevisionRef\.current;[\s\S]*const requestId = \+\+recentJobsRequestIdRef\.current;[\s\S]*requestRevision !== jobsStateRevisionRef\.current \|\|[\s\S]*requestId !== recentJobsRequestIdRef\.current/
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
    /const requestRevision = jobsStateRevisionRef\.current \+ 1;[\s\S]*jobsStateRevisionRef\.current = requestRevision;[\s\S]*setCalculationViewReset\(false\);[\s\S]*setCurrentJob\(job\);[\s\S]*requestRevision === jobsStateRevisionRef\.current[\s\S]*setCurrentJob\(detail\);/
  );
});

test('allocation reset uses a scoped safety modal and blocks active jobs', () => {
  const page = readFileSync(
    'src/pages/admin/AdminExactAllocationPage.tsx',
    'utf8'
  );

  assert.match(page, /setResetDialogOpen\(true\)/);
  assert.match(page, /role="dialog"/);
  assert.match(page, /완료되거나 실패한 최적화 계산 기록과 재사용 캐시를 삭제합니다/);
  assert.match(page, /이미 생성된 배차 초안과 확정 배차안은 유지됩니다/);
  assert.match(page, /진행 중인 계산을 먼저 취소하고 완료 상태를 확인한 뒤 리셋해주세요/);
  assert.match(page, /disabled=\{resetting \|\| activeJob\}/);
  assert.match(page, /className=\{styles\.secondary\}[\s\S]*autoFocus/);
  assert.doesNotMatch(page, /window\.confirm/);
});

test('allocation reset modal blocks duplicate execution and keeps errors visible', () => {
  const page = readFileSync(
    'src/pages/admin/AdminExactAllocationPage.tsx',
    'utf8'
  );

  assert.match(page, /const resetInFlightRef = useRef\(false\)/);
  assert.match(
    page,
    /resetInFlightRef\.current = true[\s\S]*resetExactAllocationJobs\(\)[\s\S]*resetInFlightRef\.current = false/
  );
  assert.match(page, /className=\{styles\.resetDialogError\} role="alert"/);
  assert.match(page, /onClick=\{\(\) => void confirmReset\(\)\}/);
});
