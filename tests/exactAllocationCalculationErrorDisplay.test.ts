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
  assert.match(
    allocationPage,
    /<div className=\{styles\.calculationActions\}>[\s\S]*onClick=\{handleStart\}[\s\S]*\{calculationError && \(/
  );
  assert.match(
    allocationPage,
    /<div className=\{styles\.detailedBalanceActions\}>[\s\S]*onClick=\{handleStartDetailedBalance\}[\s\S]*\{detailedBalanceError && \(/
  );
  assert.match(
    allocationPage,
    /catch \(balanceError\) \{[\s\S]*?setDetailedBalanceError\(formatError\(balanceError\)\)/
  );
  assert.ok(
    allocationPage.indexOf("{currentJob?.status === 'FAILED'") <
      allocationPage.indexOf('{!activeJob && ('),
    'failed calculation error should appear before calculation settings'
  );
  assert.match(
    allocationPage,
    /\{activeJob && calculationError && \([\s\S]*\{activeJob && detailedBalanceError && \(/
  );
  assert.match(
    allocationPage,
    /\.catch\(\(pollError\) => setCalculationError\(formatError\(pollError\)\)\)/
  );
  assert.match(
    allocationPage,
    /catch \(cancelError\) \{[\s\S]*?setCalculationError\(formatError\(cancelError\)\)/
  );
  assert.equal(
    formatExactAllocationErrorMessage(
      'GCP_SERVICE_ACCOUNT_JSON must be valid service-account JSON.'
    ),
    'Cloud Run Launcher의 GCP_SERVICE_ACCOUNT_JSON 설정이 올바른 JSON이 아닙니다. Supabase Edge Function secret을 다시 등록해주세요.'
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
    formatExactAllocationErrorMessage(
      '{"message":"No API key found in request","hint":"No `apikey` request header or url param was found."}'
    ),
    'Supabase API 키가 요청에 포함되지 않았습니다. 배포 환경의 VITE_SUPABASE_ANON_KEY와 배차 Worker의 SUPABASE_SERVICE_ROLE_KEY 설정을 확인해주세요.'
  );
  assert.equal(
    formatExactAllocationErrorMessage('이미 한국어로 작성된 오류입니다.'),
    '이미 한국어로 작성된 오류입니다.'
  );
  assert.equal(
    formatExactAllocationErrorMessage(
      'Active reservations changed after optimization.'
    ),
    '계산 후 신청 정보가 변경되었습니다. 최신 신청 정보를 반영해 다시 계산해주세요.'
  );
  assert.equal(
    formatExactAllocationErrorMessage(
      'canceling statement due to lock timeout'
    ),
    '다른 배차 작업이 계산 기록을 사용 중입니다. 잠시 후 다시 시도해주세요.'
  );
});
