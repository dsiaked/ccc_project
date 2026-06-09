import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const allocationPage = readFileSync(
  'src/pages/admin/AdminExactAllocationPage.tsx',
  'utf8'
);
const workspacePage = readFileSync(
  'src/pages/admin/AdminAllocationWorkspacePage.tsx',
  'utf8'
);
const workspaceService = readFileSync(
  'src/lib/admin/allocationWorkspaceService.ts',
  'utf8'
);

test('allocation page can create a named manual draft without an optimization job', () => {
  assert.match(allocationPage, /수동 배차 초안 생성/);
  assert.match(allocationPage, /createManualAllocationWorkspace\(name\)/);
  assert.match(allocationPage, /생성 후 편집하기/);
  assert.match(workspaceService, /create_bus_allocation_as_global_admin/);
});

test('an empty manual draft can add its first bus from the saved template', () => {
  assert.match(workspaceService, /manualBusTemplate/);
  assert.match(workspacePage, /current\.manualBusTemplate/);
  assert.match(workspacePage, /첫 버스 추가/);
});
