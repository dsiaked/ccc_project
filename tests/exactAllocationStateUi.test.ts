import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const page = readFileSync(
  'src/pages/admin/AdminExactAllocationPage.tsx',
  'utf8'
);

test('exact allocation uses distinct ready, running, and completed interfaces', () => {
  assert.match(page, /styles\.calculationReady/);
  assert.match(page, /styles\.calculationRunning/);
  assert.match(page, /styles\.calculationCompleted/);
  assert.match(page, /최적해 계산 준비/);
  assert.match(page, /최적해 계산 중/);
  assert.match(page, /최적해 계산 완료/);
  assert.match(page, /최적해 계산 시작/);
  assert.match(page, /계산 상세 보기/);
});

test('calculation settings are hidden while a job is active', () => {
  assert.match(
    page,
    /\{!activeJob && \(\s*<>\s*\{!loading && !hasSingleBusOption/
  );
  assert.match(page, /\{activeJob && currentJob && \(/);
});

test('active calculation elapsed time advances while a job is pending', () => {
  assert.match(
    page,
    /currentJob\.started_at \?\? currentJob\.requested_at/
  );
  assert.match(
    page,
    /const activeJob =\s*!calculationViewReset &&\s*currentJob !== null &&\s*activeStatuses\.has\(currentJob\.status\);/
  );
  assert.match(
    page,
    /if \(!activeJob\) return;[\s\S]*setClock\(Date\.now\(\)\)[\s\S]*\[activeJob\]/
  );
});

test('pending jobs are shown as worker queue time instead of calculation time', () => {
  assert.match(page, /const waitingForWorker = currentJob\?\.status === 'PENDING'/);
  assert.match(page, /workerClaimWarningSeconds = 30/);
  assert.match(page, /최적화 워커 연결 대기/);
  assert.match(page, /워커 대기 시간/);
  assert.match(page, /이 대기 시간은 최적해 계산 시간에 포함되지 않습니다/);
  assert.match(page, /Worker가 30초 이상 작업을 가져가지 못했습니다/);
});

test('recent job refresh keeps the selected optimization result detail', () => {
  assert.match(
    page,
    /const loadRecentJobs = useCallback\(async \(preferredJobId\?: string\) =>/
  );
  assert.match(
    page,
    /const detail = await getExactAllocationJob\(targetJob\.id\);[\s\S]*return detail \?\? targetJob;/
  );
  assert.match(
    page,
    /if \(!activeStatuses\.has\(job\.status\)\) void loadRecentJobs\(job\.id\);/
  );
});
