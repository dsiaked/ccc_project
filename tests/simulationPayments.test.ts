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
const simulationService = readFileSync(
  'src/lib/admin/simulationService.ts',
  'utf8'
);

test('simulation payment stage accepts requested and confirmed active reservations', () => {
  assert.match(
    simulationPage,
    /paymentsStageUnlocked = activeReservationCount > 0/
  );
  assert.match(
    simulationRunner,
    /if \(stage === 'payments'\)[\s\S]*\.in\('status', \['requested', 'confirmed'\]\)[\s\S]*activeReservationCount === 0/
  );
});

test('simulation payment stage processes every active reservation shown in the preview', () => {
  assert.match(
    simulationRunner,
    /\.in\('status', \['requested', 'confirmed'\]\)[\s\S]*\.order\('id', \{ ascending: true \}\)[\s\S]*\.limit\(batchSize\)/
  );
  assert.match(simulationRunner, /\.gt\('id', paymentCursorId\)/);
  assert.match(simulationRunner, /last_reservation_id:/);
  assert.doesNotMatch(simulationRunner, /\.range\(offset, offset \+ batchSize - 1\)/);
  assert.match(
    simulationRunner,
    /totalWorkItems = stage === 'payments' \? activeReservationCount : users\.length/
  );
});

test('simulation payment stage forces every active reservation to completed', () => {
  assert.match(
    simulationRunner,
    /\.update\(\{[\s\S]*status: 'completed'[\s\S]*\.in\('reservation_id', existingReservationIds\)/
  );
  assert.match(
    simulationRunner,
    /\.from\('payments'\)\.insert\(missingRows\)/
  );
  assert.doesNotMatch(
    simulationRunner,
    /\.upsert\(paymentRows, \{ onConflict: 'reservation_id' \}\)/
  );
});

test('simulation payment stage supports a random partial-payment mode that always leaves some unpaid', () => {
  assert.match(simulationPage, /handleRunStage\(index, 'random'\)/);
  assert.match(simulationPage, /랜덤 일부 입금/);
  assert.doesNotMatch(
    simulationPage,
    /랜덤 일부 입금 · \$\{activeReservationCount\.toLocaleString\(\)\}명/
  );
  assert.match(
    simulationRunner,
    /body\?\.payment_mode === 'random' \|\| body\?\.payment_mode === 'all'/
  );
  assert.match(
    simulationRunner,
    /if \(!paymentMode\)[\s\S]*입금 처리 방식이 없습니다/
  );
  assert.match(
    simulationRunner,
    /reservationIndex < activeReservationCount - 1[\s\S]*reservationIndex === 0[\s\S]*deterministicUnit/
  );
  assert.match(simulationRunner, /status: completed \? 'completed' : 'pending'/);
  assert.match(simulationRunner, /payment_mode: paymentMode/);
  assert.match(
    simulationPage,
    /finalSummary\.payment_mode !== 'random'[\s\S]*finalSummary\.pending_total/
  );
});

test('simulation payment stage falls back to the global admin for scopes without a campus admin', () => {
  assert.match(
    simulationRunner,
    /const campusAdminId = adminByScope\.get\(scope\) \?\? user\.id/
  );
});

test('simulation payment stage uses the authenticated global-admin RPC for external participants', () => {
  assert.match(
    simulationRunner,
    /reservation\.affiliation_type === 'external'[\s\S]*externalReservations\.push\(\{ reservation, completed \}\)/
  );
  assert.match(
    simulationRunner,
    /userClient\.rpc\([\s\S]*'upsert_reservation_payment'[\s\S]*p_status: completed \? 'completed' : 'pending'/
  );
});

test('simulation runner records structured database error messages', () => {
  assert.match(simulationRunner, /const getErrorMessage = \(error: unknown\)/);
  assert.match(simulationRunner, /const message = getErrorMessage\(error\)/);
});

test('simulation page surfaces edge function response errors', () => {
  assert.match(simulationService, /const getFunctionErrorMessage = async/);
  assert.match(simulationService, /context instanceof Response/);
  assert.match(
    simulationService,
    /if \(functionErrorMessage\) throw new Error\(functionErrorMessage\)/
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

test('simulation page consolidates individual payment and campus settlement', () => {
  assert.match(simulationPage, /모두 입금 완료로 만들기/);
  assert.match(simulationPage, /랜덤 일부 입금/);
  assert.match(simulationPage, /개인 입금·캠퍼스별 송금 완료 보고·본부 확인/);
  assert.match(simulationPage, /캠퍼스 송금·본부 확인/);
  assert.match(simulationPage, /index === 5/);
  assert.match(simulationPage, /runSimulationStage\('transfers'\)/);
  assert.match(simulationPage, /handleRunStage\(index, 'all'\)/);
});

test('simulation page and runner connect the boarding rehearsal stage', () => {
  assert.match(simulationPage, /출발·탑승 리허설/);
  assert.match(simulationPage, /runSimulationStage\('boarding'\)/);
  assert.match(simulationRunner, /if \(stage === 'boarding'\)/);
  assert.match(simulationRunner, /\.from\('boarding_bus_departures'\)/);
  assert.match(simulationRunner, /\.from\('boarding_status_events'\)/);
});

test('simulation closes the deadline before allocation and keeps settlement separate', () => {
  assert.match(simulationPage, /runSimulationStage\('deadline'\)/);
  assert.match(simulationRunner, /if \(stage === 'deadline'\)/);
  assert.match(
    simulationRunner,
    /신청 마감이 필요합니다\. 4단계 신청 마감을 먼저 실행하세요/
  );
  assert.match(
    simulationRunner,
    /status: 'confirmed'[\s\S]*confirmed_by: user\.id[\s\S]*actual_confirmed_amount/
  );
  assert.doesNotMatch(
    simulationRunner,
    /if \(stage === 'transfers'\)[\s\S]*'예약 마감 실패'/
  );
});

test('simulation stages link to the operational review screens', () => {
  assert.match(simulationPage, /신청 현황 확인/);
  assert.match(simulationPage, /입금·송금 최종 검토/);
  assert.match(simulationPage, /탑승 관리 열기/);
});
