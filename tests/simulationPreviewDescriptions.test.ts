import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const simulationPage = readFileSync(
  'src/pages/admin/AdminSimulationPage.tsx',
  'utf8'
);
const simulationRunner = readFileSync(
  'supabase/functions/simulation-runner/index.ts',
  'utf8'
);

test('simulation preview explains destructive and manual stage behavior', () => {
  assert.match(simulationPage, /실제 계정의 조직 소속도 초기화/);
  assert.match(simulationPage, /매 10번째 계정의 기존 신청·입금 삭제/);
  assert.match(simulationPage, /기타지구 신청은 캠퍼스 송금 대상에서 제외/);
  assert.match(simulationPage, /신청 마감은 이 단계에서 실행하고/);
  assert.match(simulationPage, /자동 시뮬레이션 실행 없이 잔여 좌석 신청 관리 화면/);
  assert.match(simulationPage, /기존 시뮬레이션 탑승 기록을 초기화/);

  assert.match(
    simulationRunner,
    /\.from\('profiles'\)[\s\S]*\.update\(clearedOrganization\)[\s\S]*\.not\('id', 'is', null\)/
  );
  assert.match(
    simulationRunner,
    /nonReservationUserIds[\s\S]*\.from\('payments'\)[\s\S]*\.from\('reservations'\)/
  );
  assert.match(
    simulationRunner,
    /reservation\.affiliation_type !== 'external'/
  );
  assert.match(
    simulationRunner,
    /\.from\('boarding_status_events'\)[\s\S]*\.delete\(\)/
  );
});

test('simulation preview separates current state from recent execution results', () => {
  assert.match(simulationPage, /현재 상태·실행 안내/);
  assert.match(simulationPage, /최근 실행 결과/);
  assert.match(simulationPage, /index !== 7 && <div className=\{styles\.previewTabs\}/);
  assert.doesNotMatch(
    simulationPage,
    /if \(index > 2\) \{[\s\S]*단계 실제 운영 상태/
  );
  assert.match(
    simulationPage,
    /index === 5[\s\S]*run\.stage === 'payments' \|\| run\.stage === 'transfers'/
  );
});

test('simulation preview describes expected changes instead of stale prior run status', () => {
  assert.match(simulationPage, /status: '실행 전 안내'/);
  assert.match(simulationPage, /status: '권장 초기값 적용 예정'/);
  assert.match(simulationPage, /\['신청 마감', '실행 시점부터 14일 후'\]/);
  assert.doesNotMatch(simulationPage, /status: latestRun\?\.status \?\? '미실행'/);
});
