import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const page = readFileSync('src/pages/CccSummerHandoffPage.tsx', 'utf8');
const service = readFileSync('src/lib/cccSummerHandoffService.ts', 'utf8');
const routes = readFileSync('src/routes/publicRoutes.tsx', 'utf8');

test('CCC Summer callback exchanges the one-time code and removes it from the URL', () => {
  assert.match(routes, /path: '\/handoff\/callback'/);
  assert.match(page, /window\.history\.replaceState/);
  assert.match(page, /exchangeCccSummerCode\(code, redirectUri\)/);
  assert.match(service, /supabase\.auth\.setSession/);
});

test('CCC Summer callback supports manual campus mapping before reservation', () => {
  assert.match(page, /getDistrictOptions/);
  assert.match(page, /getTeamOptions/);
  assert.match(page, /getCampusOptions/);
  assert.match(page, /selectCccSummerCampus\(campusId\)/);
  assert.match(page, /navigate\('\/reservation'/);
});
