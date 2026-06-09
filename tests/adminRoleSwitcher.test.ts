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
