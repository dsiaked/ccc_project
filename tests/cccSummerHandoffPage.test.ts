import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const page = readFileSync('src/pages/CccSummerHandoffPage.tsx', 'utf8');
const service = readFileSync('src/lib/cccSummerHandoffService.ts', 'utf8');
const routes = readFileSync('src/routes/publicRoutes.tsx', 'utf8');
const loginPage = readFileSync('src/pages/LoginPage.tsx', 'utf8');
const loginUrl = readFileSync('src/utils/cccSummerLogin.ts', 'utf8');

test('login page continues through CCC Summer handoff authorization', () => {
  assert.match(routes, /path: '\/signup', element: <LoginPage \/>/);
  assert.doesNotMatch(routes, /import\('\.\.\/pages\/SignupPage'\)/);
  assert.match(loginPage, /getCccSummerLoginUrl/);
  assert.match(loginPage, /window\.location\.replace\(cccSummerLoginUrl\)/);
  assert.match(loginUrl, /VITE_CCC_SUMMER_BASE_URL/);
  assert.match(loginUrl, /VITE_CCC_SUMMER_CLIENT_ID/);
  assert.match(loginUrl, /\/api\/handoff\/authorize/);
  assert.match(loginUrl, /client_id/);
  assert.match(loginUrl, /redirect_uri/);
});

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
