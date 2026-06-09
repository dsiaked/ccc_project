import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const page = readFileSync('src/pages/admin/AdminSimulationPage.tsx', 'utf8');

test('simulation disable action uses a safety modal with an explicit scope', () => {
  assert.match(page, /setDisableSafetyDialogOpen\(true\)/);
  assert.match(page, /role="dialog"/);
  assert.match(page, /새로운 시뮬레이션 단계 실행이 차단됩니다/);
  assert.match(page, /이미 생성된[\s\S]*테스트 데이터와 실행 기록은 유지/);
  assert.match(page, /데이터 초기화 작업은 실행되지[\s\S]*않습니다/);
  assert.match(page, /테스트 데이터를 삭제하려면 별도의 시뮬레이션 정보 초기화 단계를/);
  assert.match(page, /className=\{styles\.disableSafetyCancel\}[\s\S]*autoFocus/);
  assert.doesNotMatch(page, /시뮬레이션 실행을 즉시 비활성화할까요\?'\)/);
});

test('simulation disable action blocks duplicate safety-lock updates', () => {
  assert.match(page, /const safetyDisableInFlightRef = useRef\(false\)/);
  assert.match(
    page,
    /safetyDisableInFlightRef\.current = true[\s\S]*setSimulationEnabled\(enabled\)[\s\S]*safetyDisableInFlightRef\.current = false/
  );
  assert.match(
    page,
    /const confirmSimulationDisable = async \(\) => \{[\s\S]*runningStageIndex !== null[\s\S]*applySimulationEnabledChange\(false\)/
  );
  assert.match(page, /className=\{styles\.disableSafetyError\} role="alert"/);
});
