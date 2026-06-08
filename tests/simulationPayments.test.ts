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

test('simulation payment stage accepts requested and confirmed active reservations', () => {
  assert.match(
    simulationPage,
    /paymentsStageUnlocked = activeReservationCount > 0/
  );
  assert.match(
    simulationRunner,
    /if \(stage === 'payments' && !requestedRunId\)[\s\S]*\.in\('status', \['requested', 'confirmed'\]\)[\s\S]*activeReservationCount === 0/
  );
});

test('simulation payment stage forces every active reservation to completed', () => {
  assert.match(
    simulationRunner,
    /\.upsert\(paymentRows, \{ onConflict: 'reservation_id' \}\)/
  );
  assert.match(
    simulationRunner,
    /status: 'completed'[\s\S]*verified_by: campusAdminId[\s\S]*verified_at: now/
  );
  assert.doesNotMatch(
    simulationRunner,
    /payment\?\.status === 'pending'/
  );
});

test('simulation payments reject a missing ticket price', () => {
  assert.match(
    simulationRunner,
    /if \(ticketPrice <= 0\)[\s\S]*1단계 운영 초기값 설정/
  );
});

test('disabled simulation stage actions explain why they cannot run', () => {
  assert.match(simulationPage, /getStageDisabledReason/);
  assert.match(simulationPage, /현재 실행할 수 없는 이유/);
  assert.match(simulationPage, /disabledReason/);
});

test('simulation page separates individual payment completion and campus transfer reporting', () => {
  assert.match(simulationPage, /모두 입금 완료로 만들기/);
  assert.match(simulationPage, /캠퍼스 송금 완료 보고/);
  assert.match(simulationPage, /onClick=\{\(\) => void handleRunStage\(7\)\}/);
  assert.doesNotMatch(simulationPage, /랜덤 입금 상태 설정/);
  assert.doesNotMatch(simulationPage, /handleRunStage\(index, 'all'\)/);
});
