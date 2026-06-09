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
