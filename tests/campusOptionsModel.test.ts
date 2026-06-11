import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { toUniqueSelectOptions } from '../src/lib/admin/campusOptionsModel.js';

const adminService = readFileSync('src/lib/adminService.ts', 'utf8');
const campusOptionsService = readFileSync(
  'src/lib/admin/campusOptionsService.ts',
  'utf8'
);

test('campus options discard incomplete rows and deduplicate by id', () => {
  assert.deepEqual(
    toUniqueSelectOptions([
      { id: '1', name: 'first' },
      { id: null, name: 'missing id' },
      { id: '2', name: null },
      { id: '1', name: 'updated' },
    ]),
    [{ id: '1', name: 'updated' }]
  );
});

test('admin service preserves campus option exports while the focused service owns queries', () => {
  assert.match(
    adminService,
    /export \{[\s\S]*getCampusesByTeam[\s\S]*getDistrictsForAdmin[\s\S]*getTeamsByDistrict[\s\S]*\} from '\.\/admin\/campusOptionsService';/
  );
  assert.doesNotMatch(adminService, /export async function getDistrictsForAdmin/);
  assert.match(campusOptionsService, /\.from\('campus_options'\)/);
  assert.match(campusOptionsService, /toUniqueSelectOptions/);
});
