import assert from 'node:assert/strict';
import test from 'node:test';
import {
  filterAdminRolesForUser,
  findSwitchableAdminRole,
  selectAdminRole,
  shouldLoadAdminRolesDirectly,
  type AdminRole,
  type AdminRoleType,
} from '../src/lib/admin/adminRoleModel.js';

const createRole = (
  id: string,
  role: AdminRoleType,
  userId = 'user-1'
): AdminRole => ({
  id,
  user_id: userId,
  role,
  campus_id: role === 'campus_admin' ? `campus-${id}` : null,
  district: role === 'campus_admin' ? 'district' : null,
  team: role === 'campus_admin' ? 'team' : null,
  campus: role === 'campus_admin' ? `campus ${id}` : null,
});

test('admin role filtering keeps only roles owned by the requested user', () => {
  const ownedRole = createRole('owned', 'campus_admin');
  const roles = [
    createRole('other', 'global_admin', 'user-2'),
    ownedRole,
  ];

  assert.deepEqual(filterAdminRolesForUser(roles, 'user-1'), [ownedRole]);
});

test('admin roles fall back to a direct query only after an RPC error or empty result', () => {
  const roles = [createRole('campus', 'campus_admin')];

  assert.equal(shouldLoadAdminRolesDirectly(null, roles), false);
  assert.equal(shouldLoadAdminRolesDirectly(new Error('RPC failed'), roles), true);
  assert.equal(shouldLoadAdminRolesDirectly(null, []), true);
});

test('admin role selection preserves global, stored, boarding, and campus priority', () => {
  const campusRole = createRole('campus', 'campus_admin');
  const secondCampusRole = createRole('campus-2', 'campus_admin');
  const boardingRole = createRole('boarding', 'boarding_manager');
  const globalRole = createRole('global', 'global_admin');

  assert.equal(
    selectAdminRole([campusRole, boardingRole, globalRole], campusRole.id),
    globalRole
  );
  assert.equal(
    selectAdminRole([campusRole, secondCampusRole, boardingRole], secondCampusRole.id),
    secondCampusRole
  );
  assert.equal(selectAdminRole([campusRole, boardingRole], null), boardingRole);
  assert.equal(selectAdminRole([campusRole], null), campusRole);
  assert.equal(selectAdminRole([], null), null);
});

test('global administrator roles cannot be selected as a scoped active role', () => {
  const campusRole = createRole('campus', 'campus_admin');
  const globalRole = createRole('global', 'global_admin');
  const roles = [campusRole, globalRole];

  assert.equal(findSwitchableAdminRole(roles, campusRole.id), campusRole);
  assert.equal(findSwitchableAdminRole(roles, globalRole.id), undefined);
  assert.equal(findSwitchableAdminRole(roles, 'missing'), undefined);
});
