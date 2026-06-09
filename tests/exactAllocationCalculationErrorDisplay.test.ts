import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { formatExactAllocationErrorMessage } from '../src/lib/admin/exactAllocationErrorMessage.js';

const allocationPage = readFileSync(
  'src/pages/admin/AdminExactAllocationPage.tsx',
  'utf8'
);

test('allocation calculation errors are displayed beside the calculation controls', () => {
  assert.match(
    allocationPage,
    /const \[calculationError, setCalculationError\] = useState<string \| null>\(null\)/
  );
  assert.match(
    allocationPage,
    /onClick=\{handleStart\}[\s\S]*?\{calculationError && \(/
  );
  assert.match(allocationPage, /className=\{styles\.calculationError\} role="alert"/);
  assert.match(
    allocationPage,
    /catch \(startError\) \{[\s\S]*?setCalculationError\(formatError\(startError\)\)/
  );
  assert.match(
    allocationPage,
    /formatExactAllocationErrorMessage\(currentJob\.error_message\)/
  );
});

test('allocation calculation errors are translated to Korean', () => {
  assert.equal(
    formatExactAllocationErrorMessage('At least one passenger is required.'),
    '배차 계산할 신청자가 한 명 이상 필요합니다.'
  );
  assert.equal(
    formatExactAllocationErrorMessage('total_buses phase ended with INFEASIBLE.'),
    '현재 신청 정보와 배차 조건을 만족하는 결과를 찾을 수 없습니다.'
  );
  assert.equal(
    formatExactAllocationErrorMessage('Unexpected internal optimizer failure.'),
    '배차 계산 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.'
  );
  assert.equal(
    formatExactAllocationErrorMessage('이미 한국어로 작성된 오류입니다.'),
    '이미 한국어로 작성된 오류입니다.'
  );
});
