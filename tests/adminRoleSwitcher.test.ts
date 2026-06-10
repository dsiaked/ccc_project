import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const adminHeader = readFileSync('src/pages/admin/AdminHeader.tsx', 'utf8');
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
  assert.match(adminHeader, /탑승 관리 간사님 역할/);
  assert.match(adminHeader, /캠퍼스 회계 순장님 ·/);
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

test('scoped administrator switcher includes accessible administrator functions', () => {
  assert.match(
    adminHeader,
    /adminRole !== null && adminRole !== 'global_admin'/
  );
  assert.match(adminHeader, /const availableScopedRoles =/);
  assert.match(adminHeader, /\? \[activeAdminRole, \.\.\.switchableRoles\]/);
  assert.match(adminHeader, /availableScopedRoles\.map\(\(role\) =>/);
  assert.match(adminHeader, /<optgroup label="관리자 기능">/);
  assert.match(adminHeader, /aria-label="역할 또는 관리자 기능 선택"/);
  assert.match(adminHeader, /const scopedAdminFunctionItems = navItems\.filter/);
  assert.match(adminHeader, /role === 'campus_admin' \|\| role === 'boarding_manager'/);
  assert.match(adminHeader, /scopedAdminFunctionItems\.map\(\(item\) =>/);
  assert.match(adminHeader, /disabled=\{!canUseAdminFunction\(item\)\}/);
  assert.match(adminHeader, /' · 권한 필요'/);
  assert.match(adminHeader, /value=\{`nav:\$\{item\.path\}`\}/);
  assert.match(adminHeader, /handleNavItemClick\(item\)/);
});
