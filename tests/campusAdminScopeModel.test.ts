import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  mapCampusAdminAssignments,
  mapCampusScopes,
} from '../src/lib/admin/campusAdminScopeModel.js';

const adminService = readFileSync('src/lib/adminService.ts', 'utf8');
const scopeService = readFileSync(
  'src/lib/admin/campusAdminScopeService.ts',
  'utf8'
);

test('campus scope rows preserve their sorted query shape', () => {
  assert.deepEqual(
    mapCampusScopes([
      {
        campus_id: 'campus-1',
        district: 'district',
        team: 'team',
        campus: 'campus',
      },
    ]),
    [
      {
        campusId: 'campus-1',
        district: 'district',
        team: 'team',
        campus: 'campus',
      },
    ]
  );
});

test('campus administrator assignments join profiles and preserve missing-value fallbacks', () => {
  const roles = [
    {
      id: 'role-1',
      user_id: 'user-1',
      campus_id: null,
      district: null,
      team: null,
      campus: null,
    },
  ];

  assert.deepEqual(mapCampusAdminAssignments(roles, []), [
    {
      campusId: '',
      district: '',
      team: '',
      campus: '',
      adminRoleId: 'role-1',
      userId: 'user-1',
      name: '이름 없음',
      email: null,
      phone: null,
    },
  ]);

  assert.equal(
    mapCampusAdminAssignments(roles, [
      {
        id: 'user-1',
        name: '관리자',
        email: 'admin@example.com',
        phone: '010-0000-0000',
      },
    ])[0]?.name,
    '관리자'
  );
});

test('admin service preserves campus scope exports while the focused service owns queries', () => {
  assert.match(
    adminService,
    /export \{[\s\S]*getCampusAdminAssignments[\s\S]*getCampusScopesForAdmin[\s\S]*\} from '\.\/admin\/campusAdminScopeService';/
  );
  assert.doesNotMatch(adminService, /export async function getCampusScopesForAdmin/);
  assert.match(scopeService, /\.from\('admin_roles'\)/);
  assert.match(scopeService, /mapCampusAdminAssignments/);
});
