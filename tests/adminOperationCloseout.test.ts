import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const page = readFileSync('src/pages/admin/AdminOperationCloseoutPage.tsx', 'utf8');
const service = readFileSync('src/lib/admin/operationCloseoutService.ts', 'utf8');
const routes = readFileSync('src/routes/adminRoutes.tsx', 'utf8');
const sql = readFileSync('sql/setup/185_operation_closeout.sql', 'utf8');

test('operation closeout is a separate global administrator screen', () => {
  assert.match(routes, /path: 'system\/closeout'/);
  assert.match(routes, /<AdminOperationCloseoutPage \/>/);
  assert.match(page, /운영 종료 점검/);
});

test('operation closeout uses mixed automatic and manual confirmation', () => {
  assert.match(page, /확인 필요 항목이 있어도 사유를 남기면 종료할 수 있습니다/);
  assert.match(page, /reviewed/);
  assert.match(page, /expectedConfirmation/);
  assert.match(page, /운영 종료/);
  assert.match(page, /종료 취소/);
});

test('operation closeout is recorded without locking correction workflows', () => {
  assert.match(page, /종료 상태는 기록용입니다/);
  assert.match(page, /기존 관리 기능은 잠기지 않으며/);
  assert.match(service, /update_operation_closeout/);
  assert.match(sql, /resource_type, resource_id, before_data, after_data/);
  assert.doesNotMatch(sql, /create trigger/i);
  assert.doesNotMatch(sql, /boarding_status/i);
});

test('operation closeout remains separate from the dashboard manual checklist', () => {
  assert.match(page, /대시보드 6단계 수동 체크 상태와도 별도로 유지됩니다/);
  assert.doesNotMatch(page, /updateGlobalScenarioChecklist/);
  assert.doesNotMatch(service, /global_scenario_checklist/);
});
