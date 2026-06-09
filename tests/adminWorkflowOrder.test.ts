import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const adminHeader = readFileSync('src/pages/admin/AdminHeader.tsx', 'utf8');
const adminHeaderStyles = readFileSync(
  'src/pages/admin/AdminHeader.module.css',
  'utf8'
);
const adminDashboard = readFileSync('src/pages/admin/AdminGlobalPage.tsx', 'utf8');
const simulationPage = readFileSync(
  'src/pages/admin/AdminSimulationPage.tsx',
  'utf8'
);

test('admin stage navigation places allocation before payment review', () => {
  assert.ok(
    adminHeader.indexOf("{ id: 'allocation', label: '3. 배차' }") <
      adminHeader.indexOf("{ id: 'payment', label: '4. 입금 · 검토' }")
  );
});

test('admin sidebar places personal payment and campus transfer management before the campus administrator page', () => {
  assert.ok(
    adminHeader.indexOf("label: '개인 입금 · 캠퍼스별 송금 관리'") <
      adminHeader.indexOf("label: '캠퍼스 회계 순장님 페이지'")
  );
});

test('admin sidebar places boarding manager permissions under boarding operations', () => {
  const boardingStart = adminHeader.indexOf(
    "label: '탑승 확인 관리'"
  );
  const boardingManagerStart = adminHeader.indexOf(
    "label: '탑승 관리 간사님 권한·담당 호차 관리'"
  );
  const boardingManagerEnd = adminHeader.indexOf(
    "label: '개인 입금 · 캠퍼스별 송금 관리'",
    boardingManagerStart
  );
  const boardingManagerItem = adminHeader.slice(
    boardingManagerStart,
    boardingManagerEnd
  );

  assert.ok(boardingStart > -1);
  assert.ok(boardingStart < boardingManagerStart);
  assert.match(boardingManagerItem, /path: '\/admin\/access\/boarding-managers'/);
  assert.match(boardingManagerItem, /stageGroup: 'boarding'/);
  assert.match(boardingManagerItem, /allowedRoles: \['global_admin'\]/);
  assert.doesNotMatch(adminHeader, /label: '캠퍼스 회계 순장님 관리'/);
  assert.doesNotMatch(adminHeader, /path: '\/admin\/access\/campus-admins'/);
});

test('admin sidebar prevents desktop horizontal scrolling', () => {
  assert.match(adminHeaderStyles, /\.header\s*\{[\s\S]*?overflow-x: hidden;/);
  assert.match(adminHeaderStyles, /\.nav\s*\{[\s\S]*?overflow-x: hidden;/);
  assert.match(
    adminHeaderStyles,
    /\.navItemLabel\s*\{[\s\S]*?overflow-wrap: anywhere;[\s\S]*?white-space: normal;/
  );
  assert.doesNotMatch(adminHeaderStyles, /text-overflow: ellipsis;/);
});

test('admin dashboard places allocation planning before payment management', () => {
  assert.ok(
    adminDashboard.indexOf("id: 'allocation-planning'") <
      adminDashboard.indexOf("id: 'payment-and-request-management'")
  );
  assert.ok(
    adminDashboard.indexOf("id: 'remaining-seat-sales'") <
      adminDashboard.indexOf("id: 'payment-and-request-management'")
  );
});

test('admin dashboard separates continuous payment and inquiry work from numbered steps', () => {
  const numberedStepsStart = adminDashboard.indexOf(
    'const operationScenarioSteps = ['
  );
  const numberedStepsEnd = adminDashboard.indexOf(
    'const continuousOperationStep ='
  );
  const numberedSteps = adminDashboard.slice(numberedStepsStart, numberedStepsEnd);

  assert.doesNotMatch(numberedSteps, /id: 'payment-and-request-management'/);
  assert.match(adminDashboard, /className=\{styles\.continuousOperationBlock\}/);
  assert.match(adminDashboard, /<span>상시 운영<\/span>/);
  assert.match(adminDashboard, /<CreditCard size=\{17\} \/>/);
});

test('admin dashboard keeps application status in step 2 and deadline closing in step 3 related actions', () => {
  const step2Start = adminDashboard.indexOf("id: 'post-deadline-operations'");
  const step3Start = adminDashboard.indexOf("id: 'allocation-planning'");
  const step4Start = adminDashboard.indexOf("id: 'remaining-seat-sales'");
  const step2 = adminDashboard.slice(step2Start, step3Start);
  const step3 = adminDashboard.slice(step3Start, step4Start);

  assert.match(step2, /actionLabel: '가입 신청 현황 확인하기'/);
  assert.match(step2, /actionPath: '\/admin\/applications'/);
  assert.doesNotMatch(step2, /actionLinks:/);
  assert.match(
    step3,
    /\{ label: '신청마감하기', path: '\/admin\/settings\/reservation-deadline' \}/
  );
});

test('admin dashboard shows the retreat-day timing for each operation step', () => {
  [
    "timing: '수련회 전'",
    "timing: '수련회 2일차'",
    "timing: '수련회 3일차 24:00'",
    "timing: '수련회 4일차'",
    "timing: '신청 기간 동안 상시 · 수련회 4일차 24:00 최종 확인'",
  ].forEach((timing) => assert.match(adminDashboard, new RegExp(timing)));

  assert.match(adminDashboard, /styles\.scenarioTiming/);
  assert.doesNotMatch(adminDashboard, /id: 'final-check'/);
});

test('admin dashboard summarizes the participation journey in order', () => {
  const labels = [
    "label: '참여 목표'",
    "label: '가입'",
    "label: '신청'",
    "label: '입금 완료'",
    "label: '배차 확정'",
  ];

  labels.slice(1).forEach((label, index) => {
    assert.ok(adminDashboard.indexOf(labels[index]) < adminDashboard.indexOf(label));
  });
  assert.match(adminDashboard, /payments!inner\(status\)/);
  assert.match(adminDashboard, /\.not\('confirmed_ticket', 'is', null\)/);
});

test('simulation displays deadline and allocation before the consolidated payment stage', () => {
  assert.match(
    simulationPage,
    /simulationStageDisplayOrder = \[0, 1, 2, 3, 6, 5, 7, 8\]/
  );
  assert.match(simulationPage, /신청 마감 및 배차 계획 산출 및 확정/);
  assert.match(simulationPage, /개인 입금·캠퍼스별 송금 완료 보고·본부 확인/);
  assert.match(
    simulationPage,
    /simulationStageDisplayOrder\.map\(\(index\) =>/
  );
});
