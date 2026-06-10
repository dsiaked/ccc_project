import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const adminRoutes = readFileSync('src/routes/adminRoutes.tsx', 'utf8');
const adminHeader = readFileSync('src/pages/admin/AdminHeader.tsx', 'utf8');
const adminToolsPage = readFileSync(
  'src/pages/admin/AdminToolsPage.tsx',
  'utf8'
);
const adminSetupPage = readFileSync(
  'src/pages/admin/AdminSetupCheckPage.tsx',
  'utf8'
);

test('global administrators can open the administrator tools hub', () => {
  assert.match(adminRoutes, /path: 'system'/);
  assert.match(adminRoutes, /<AdminToolsPage \/>/);
  assert.match(adminRoutes, /path: 'tools', to: '\/admin\/system'/);
});

test('administrator tools are listed under operation preparation', () => {
  const toolsStart = adminHeader.indexOf("label: '관리자 도구'");
  const simulationStart = adminHeader.indexOf("label: '시뮬레이션'");
  const toolsItem = adminHeader.slice(toolsStart, simulationStart);

  assert.ok(toolsStart > -1);
  assert.match(toolsItem, /path: '\/admin\/system'/);
  assert.match(toolsItem, /stageGroup: 'prepare'/);
  assert.match(toolsItem, /allowedRoles: \['global_admin'\]/);
});

test('invitation code management stays in the tools hub instead of the sidebar', () => {
  assert.doesNotMatch(adminHeader, /label: '권한 등록 코드 관리'/);
  assert.doesNotMatch(adminHeader, /path: '\/admin\/system\/invitation-codes'/);
  assert.match(adminToolsPage, /path: '\/admin\/system\/invitation-codes'/);
});

test('administrator tools hub links to existing management screens', () => {
  [
    '/admin/access/campus-admins',
    '/admin/access/boarding-managers',
    '/admin/system/invitation-codes',
    '/admin/users',
    '/admin/system/simulation',
    '/admin/system/audit-logs',
    '/admin/system/closeout',
    '/admin/settings',
    '/admin/settings/participation-targets',
    '/admin/settings/reservation-deadline',
    '/admin/settings#data-reset',
  ].forEach((path) => assert.match(adminToolsPage, new RegExp(path)));
});

test('data reset deep link opens the existing guarded reset panel', () => {
  assert.match(adminSetupPage, /location\.hash !== '#data-reset'/);
  assert.match(adminSetupPage, /\(\) => location\.hash === '#data-reset'/);
  assert.match(adminSetupPage, /id="data-reset"/);
});
