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
    /const activeJob = currentJob !== null && activeStatuses\.has\(currentJob\.status\);/
  );
  assert.match(
    page,
    /if \(!activeJob\) return;[\s\S]*setClock\(Date\.now\(\)\)[\s\S]*\[activeJob\]/
  );
});
