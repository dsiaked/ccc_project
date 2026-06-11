import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const adminHeader = readFileSync('src/pages/admin/AdminHeader.tsx', 'utf8');
const adminHeaderStyles = readFileSync(
  'src/pages/admin/AdminHeader.module.css',
  'utf8'
);

test('global admin sidebar exclusively exposes a keyboard accessible function search', () => {
  assert.match(adminHeader, /placeholder="관리자 기능 검색"/);
  assert.match(
    adminHeader,
    /if \(activeAdminRole\?\.role !== 'global_admin'\) return/
  );
  assert.match(
    adminHeader,
    /\{adminRole === 'global_admin' && \(\s*<div className=\{styles\.functionSearch\}>/
  );
  assert.match(adminHeader, /event\.ctrlKey \|\| event\.metaKey/);
  assert.match(adminHeader, /event\.key\.toLowerCase\(\) === 'k'/);
  assert.match(adminHeader, /event\.key === 'ArrowDown'/);
  assert.match(adminHeader, /event\.key === 'Enter'/);
});

test('admin function search includes detailed screens outside the sidebar', () => {
  [
    '/admin/access/campus-admins',
    '/admin/settings/participation-targets',
    '/admin/settings/reservation-deadline',
    '/admin/allocations/workspace',
    '/admin/allocations/logic',
    '/admin/system/ai-reports',
    '/admin/system/invitation-codes',
  ].forEach((path) => assert.match(adminHeader, new RegExp(path)));
});

test('admin function search reuses role-aware navigation', () => {
  assert.match(adminHeader, /if \(!canUseAdminFunction\(item\)\) return false/);
  assert.match(adminHeader, /await handleNavItemClick\(item\)/);
  assert.match(adminHeaderStyles, /\.searchResults\s*\{/);
  assert.match(adminHeaderStyles, /\.activeSearchResult/);
});

test('mobile admin header gives search and navigation separate grid rows', () => {
  assert.match(
    adminHeaderStyles,
    /"switcher switcher"\s+"search search"\s+"nav nav"/
  );
  assert.match(
    adminHeaderStyles,
    /\.functionSearch,\s*\.header\.collapsed \.functionSearch\s*\{[\s\S]*?grid-area: search;/
  );
});
