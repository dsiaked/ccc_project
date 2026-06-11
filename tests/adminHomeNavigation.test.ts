import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const adminHeader = readFileSync('src/pages/admin/AdminHeader.tsx', 'utf8');
const adminHome = readFileSync('src/pages/admin/AdminHomePage.tsx', 'utf8');
const adminHomeStyles = readFileSync(
  'src/pages/admin/AdminHomePage.module.css',
  'utf8'
);
const adminRoutes = readFileSync('src/routes/adminRoutes.tsx', 'utf8');

test('admin logo opens the administrator home while the home button opens the service home', () => {
  assert.equal(
    adminHeader.match(/onClick=\{\(\) => navigate\('\/'\)\}/g)?.length,
    1
  );
  assert.match(adminHeader, /onClick=\{\(\) => navigate\('\/admin\/home'\)\}/);
  assert.match(adminHeader, /aria-label="관리자 홈으로 이동"/);
  assert.match(adminHeader, /className=\{styles\.homeButton\}/);
  assert.match(adminHeader, />홈 화면으로<\/span>/);
});

test('administrator home exposes role-aware sidebar functions as mobile buttons', () => {
  assert.match(adminRoutes, /path: 'home'/);
  assert.match(adminRoutes, /<AdminHomePage \/>/);
  assert.match(adminHome, /navItems\.filter/);
  assert.match(adminHome, /canAdminRoleAccess\(adminRole\.role, item\.allowedRoles\)/);
  assert.match(adminHome, /stageNavGroups\.map/);
  assert.match(adminHome, /className=\{styles\.menuButton\}/);
  assert.match(
    adminHomeStyles,
    /@media \(max-width: 560px\)[\s\S]*\.buttonGrid\s*\{[\s\S]*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/
  );
});
