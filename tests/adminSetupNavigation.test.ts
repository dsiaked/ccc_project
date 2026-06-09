import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const adminSetupPage = readFileSync(
  'src/pages/admin/AdminSetupCheckPage.tsx',
  'utf8'
);

test('campus administrator assignment links to campus administrator management', () => {
  const campusAdminSetupStart = adminSetupPage.indexOf("id: 'campus-admins'");
  const nextSetupItemStart = adminSetupPage.indexOf(
    "id: 'destinations'",
    campusAdminSetupStart
  );
  const campusAdminSetup = adminSetupPage.slice(
    campusAdminSetupStart,
    nextSetupItemStart
  );

  assert.match(
    campusAdminSetup,
    /actionPath: '\/admin\/access\/campus-admins'/
  );
  assert.match(
    adminSetupPage,
    /onClick=\{\(\) => navigate\('\/admin\/access\/campus-admins'\)\}[\s\S]*?>\s*관리자 권한 설정/
  );
  assert.doesNotMatch(
    adminSetupPage,
    /onClick=\{\(\) => navigate\('\/admin\/users'\)\}[\s\S]*?>\s*관리자 권한 설정/
  );
});

test('operation settings include boarding manager management', () => {
  const boardingManagerSetupStart = adminSetupPage.indexOf(
    "id: 'boarding-managers'"
  );
  const nextSetupItemStart = adminSetupPage.indexOf(
    "id: 'destinations'",
    boardingManagerSetupStart
  );
  const boardingManagerSetup = adminSetupPage.slice(
    boardingManagerSetupStart,
    nextSetupItemStart
  );

  assert.ok(boardingManagerSetupStart > -1);
  assert.match(boardingManagerSetup, /title: '탑승 관리 간사님 관리'/);
  assert.match(
    boardingManagerSetup,
    /actionPath: '\/admin\/access\/boarding-managers'/
  );
  assert.match(adminSetupPage, /\.eq\('role', 'boarding_manager'\)/);
  assert.match(
    adminSetupPage,
    /<span>탑승 관리 간사님<\/span>[\s\S]*?\{boardingManagerCount\.toLocaleString\(\)\}명 지정/
  );
});
