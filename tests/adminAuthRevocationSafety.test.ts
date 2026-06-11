import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const adminAuthProvider = readFileSync(
  'src/components/AdminAuthProvider.tsx',
  'utf8'
);
const adminService = readFileSync('src/lib/adminService.ts', 'utf8');

test('administrator roles are revalidated after auth events and manual refreshes', () => {
  assert.match(adminAuthProvider, /clearAdminRoleCache\(resolvedSession\.user\.id\)/);
  assert.match(
    adminAuthProvider,
    /clearAdminRoleCache\(resolvedSession\.user\.id\)[\s\S]*Promise\.all\([\s\S]*getAdminRoles\(resolvedSession\.user\.id\)[\s\S]*getAdminRole\(resolvedSession\.user\.id\)/
  );
  assert.match(
    adminAuthProvider,
    /const requestId = \(requestIdRef\.current \+= 1\);[\s\S]*if \(requestIdRef\.current !== requestId\) return;/
  );
  assert.doesNotMatch(adminAuthProvider, /authenticatedUserIdRef/);
  assert.doesNotMatch(
    adminAuthProvider,
    /event === 'SIGNED_IN' \|\| event === 'TOKEN_REFRESHED'/
  );
});

test('administrator role switches revalidate ownership instead of trusting cached roles', () => {
  const roleSwitch = adminService.slice(
    adminService.indexOf('export async function setActiveAdminRole'),
    adminService.indexOf('export async function setActiveCampusAdminRole')
  );

  assert.match(
    roleSwitch,
    /invalidateAdminRoleCache\(userId\)[\s\S]*getAdminRoles\(userId\)/
  );
});
