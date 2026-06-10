import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const adminAuthProvider = readFileSync(
  'src/components/AdminAuthProvider.tsx',
  'utf8'
);

test('administrator roles are revalidated after auth events and manual refreshes', () => {
  assert.match(adminAuthProvider, /clearAdminRoleCache\(resolvedSession\.user\.id\)/);
  assert.match(
    adminAuthProvider,
    /clearAdminRoleCache\(resolvedSession\.user\.id\)[\s\S]*getAdminRole\(resolvedSession\.user\.id\)/
  );
  assert.doesNotMatch(adminAuthProvider, /authenticatedUserIdRef/);
  assert.doesNotMatch(
    adminAuthProvider,
    /event === 'SIGNED_IN' \|\| event === 'TOKEN_REFRESHED'/
  );
});
