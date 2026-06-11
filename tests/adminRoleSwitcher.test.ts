import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const adminHeader = readFileSync('src/pages/admin/AdminHeader.tsx', 'utf8');
const adminService = readFileSync('src/lib/adminService.ts', 'utf8');
const adminHeaderStyles = readFileSync(
  'src/pages/admin/AdminHeader.module.css',
  'utf8'
);

test('campus administrators keep the role switcher near the top of the sidebar', () => {
  assert.match(
    adminHeader,
    /\{isCampusAdmin && roleSwitcher && \(\s*<div className=\{styles\.topRoleSwitcher\}>/
  );
  assert.match(adminHeader, /\{!isCampusAdmin && roleSwitcher\}/);
  assert.doesNotMatch(adminHeader, /탑승 관리 간사님 역할/);
  assert.doesNotMatch(adminHeader, /캠퍼스 회계 순장님 ·/);
  assert.match(adminHeaderStyles, /\.topRoleSwitcher\s*\{/);
  assert.match(
    adminHeaderStyles,
    /\.header\.collapsed \.topRoleSwitcher\s*\{\s*display: none;/
  );
  assert.match(
    adminHeaderStyles,
    /@media \(max-width: 900px\)[\s\S]*\.header\.collapsed \.topRoleSwitcher\s*\{\s*display: block;/
  );
  assert.match(
    adminHeaderStyles,
    /@media \(max-width: 560px\)[\s\S]*"switcher switcher"/
  );
});

test('scoped administrators keep only the top controls on narrow mobile screens', () => {
  assert.match(
    adminHeader,
    /const hasCompactMobileHeader = isCampusAdmin \|\| isBoardingManager;/
  );
  assert.match(
    adminHeader,
    /hasCompactMobileHeader \? styles\.compactRoleHeader : ''/
  );
  assert.match(
    adminHeaderStyles,
    /@media \(max-width: 560px\)[\s\S]*\.compactRoleHeader \.nav\s*\{\s*display: none;/
  );
  assert.match(
    adminHeaderStyles,
    /\.compactRoleHeader,\s*\.compactRoleHeader\.collapsed\s*\{[\s\S]*?grid-template-areas: "logo actions";/
  );
});

test('scoped administrator switcher shares the mobile action row with home', () => {
  assert.match(
    adminHeader,
    /<div className=\{styles\.mobileRoleSwitcher\}>\{roleSwitcher\}<\/div>/
  );
  assert.match(
    adminHeaderStyles,
    /\.compactRoleHeader \.topRoleSwitcher,\s*\.compactRoleHeader \.desktopRoleSwitcher\s*\{\s*display: none;/
  );
  assert.match(
    adminHeaderStyles,
    /\.compactRoleHeader \.mobileRoleSwitcher\s*\{\s*display: block;[\s\S]*flex: 1 1 auto;/
  );
});

test('administrator header omits the logout action', () => {
  assert.doesNotMatch(adminHeader, /LogoutModal|LogOut|logoutButton|로그아웃/);
  assert.doesNotMatch(adminHeaderStyles, /\.logoutButton|\.logoutLabel/);
});

test('scoped administrator switcher distinguishes managed campuses and presents shared functions once', () => {
  assert.match(
    adminHeader,
    /adminRole !== null && adminRole !== 'global_admin'/
  );
  assert.match(adminHeader, /const availableScopedRoles =/);
  assert.match(adminHeader, /\? \[activeAdminRole, \.\.\.switchableRoles\]/);
  assert.match(adminHeader, /availableScopedRoles\.map\(\(role\) =>/);
  assert.match(adminHeader, /value=\{`role:\$\{role\.id\}`\}/);
  assert.match(
    adminHeader,
    /`캠퍼스 회계 순장님 페이지 · \$\{\[\s*role\.district,\s*role\.team,\s*role\.campus,?\s*\]/
  );
  assert.doesNotMatch(adminHeader, /<optgroup/);
  assert.match(adminHeader, /<span>관리자 메뉴<\/span>/);
  assert.match(adminHeader, /aria-label="관리자 메뉴 선택"/);
  assert.match(adminHeader, /const scopedAdminFunctionItems = navItems\.filter/);
  assert.match(adminHeader, /role === 'campus_admin' \|\| role === 'boarding_manager'/);
  assert.match(
    adminHeader,
    /const accessibleScopedAdminFunctionItems = scopedAdminFunctionItems\.filter\(\s*canUseAdminFunction\s*\)/
  );
  assert.match(
    adminHeader,
    /const sharedScopedAdminFunctionItems = accessibleScopedAdminFunctionItems\.filter/
  );
  assert.match(adminHeader, /sharedScopedAdminFunctionItems\.map\(\(item\) =>/);
  assert.doesNotMatch(adminHeader, /disabled=\{!canUseAdminFunction\(item\)\}/);
  assert.doesNotMatch(adminHeader, /' · 권한 필요'/);
  assert.match(adminHeader, /value=\{`nav:\$\{item\.path\}`\}/);
  assert.match(adminHeader, /handleNavItemClick\(item\)/);
});

test('scoped administrator switcher refreshes all owned roles including boarding manager access', () => {
  assert.match(adminService, /supabase\.rpc\('get_my_admin_roles'\)/);
  assert.match(adminHeader, /clearAdminRoleCache\(session\.user\.id\)/);
  assert.match(adminHeader, /table: 'admin_roles'/);
  assert.match(adminHeader, /filter: `user_id=eq\.\$\{session\.user\.id\}`/);
  assert.match(
    adminHeader,
    /roles\.filter\(\(item\) => item\.role !== 'global_admin'\)/
  );
  assert.match(adminHeader, /\.subscribe\(\);\s*\n\s*refreshRoles\(\);/);
  assert.doesNotMatch(
    adminHeader,
    /loadAdminRole\(\)\.catch\(\(\) => \{\s*if \(isMounted\) setSwitchableRoles\(\[\]\)/
  );
  assert.match(adminHeader, /role\.role === 'campus_admin'[\s\S]*: '탑승 확인 관리'/);
});
