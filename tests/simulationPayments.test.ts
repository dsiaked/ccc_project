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
    /if \(stage === 'payments'\)[\s\S]*\.in\('status', \['requested', 'confirmed'\]\)[\s\S]*activeReservationCount === 0/
  );
});

test('simulation payment stage processes every active reservation shown in the preview', () => {
  assert.match(
    simulationRunner,
    /\.in\('status', \['requested', 'confirmed'\]\)[\s\S]*\.order\('id'\)[\s\S]*\.range\(offset, offset \+ batchSize - 1\)/
  );
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

test('simulation payment stage falls back to the global admin for scopes without a campus admin', () => {
  assert.match(
    simulationRunner,
    /const campusAdminId = adminByScope\.get\(scope\) \?\? user\.id/
  );
});

test('simulation payment stage uses the authenticated global-admin RPC for external participants', () => {
  assert.match(
    simulationRunner,
    /reservation\.affiliation_type === 'external'[\s\S]*externalReservations\.push\(reservation\)/
  );
  assert.match(
    simulationRunner,
    /userClient\.rpc\([\s\S]*'upsert_reservation_payment'[\s\S]*p_status: 'completed'/
  );
});

test('simulation runner records structured database error messages', () => {
  assert.match(simulationRunner, /const getErrorMessage = \(error: unknown\)/);
  assert.match(simulationRunner, /const message = getErrorMessage\(error\)/);
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

test('simulation page orders settlement after individual payment completion', () => {
  assert.match(simulationPage, /모두 입금 완료로 만들기/);
  assert.match(simulationPage, /신청 마감·송금·본부 확인/);
  assert.match(simulationPage, /index === 5/);
  assert.match(simulationPage, /runSimulationStage\('transfers'\)/);
  assert.doesNotMatch(simulationPage, /랜덤 입금 상태 설정/);
  assert.doesNotMatch(simulationPage, /handleRunStage\(index, 'all'\)/);
});

test('simulation page and runner connect the boarding rehearsal stage', () => {
  assert.match(simulationPage, /출발·탑승 리허설/);
  assert.match(simulationPage, /runSimulationStage\('boarding'\)/);
  assert.match(simulationRunner, /if \(stage === 'boarding'\)/);
  assert.match(simulationRunner, /\.from\('boarding_bus_departures'\)/);
  assert.match(simulationRunner, /\.from\('boarding_status_events'\)/);
});

test('simulation settlement confirms headquarters transfers before allocation', () => {
  assert.match(
    simulationRunner,
    /status: 'confirmed'[\s\S]*confirmed_by: user\.id[\s\S]*actual_confirmed_amount/
  );
  assert.match(simulationPage, /신청 마감과 캠퍼스 송금·본부 확인이 필요합니다/);
});
