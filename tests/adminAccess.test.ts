import assert from 'node:assert/strict';
import test from 'node:test';

import {
  canAdminRoleAccess,
  getAdminFallbackPath,
} from '../src/utils/adminAccess.js';

test('global administrators inherit every administrator permission', () => {
  assert.equal(canAdminRoleAccess('global_admin', ['campus_admin']), true);
  assert.equal(canAdminRoleAccess('global_admin', ['boarding_manager']), true);
});

test('scoped administrators only receive explicitly allowed permissions', () => {
  assert.equal(canAdminRoleAccess('campus_admin', ['campus_admin']), true);
  assert.equal(canAdminRoleAccess('campus_admin', ['boarding_manager']), false);
  assert.equal(canAdminRoleAccess('boarding_manager', ['boarding_manager']), true);
  assert.equal(canAdminRoleAccess('boarding_manager', ['campus_admin']), false);
});

test('administrator fallback routes never loop users without a role', () => {
  assert.equal(getAdminFallbackPath(null), '/login');
  assert.equal(getAdminFallbackPath('global_admin'), '/admin/dashboard');
  assert.equal(getAdminFallbackPath('campus_admin'), '/admin/campus-dashboard');
  assert.equal(getAdminFallbackPath('boarding_manager'), '/admin/boarding');
});
