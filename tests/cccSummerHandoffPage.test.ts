import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const page = readFileSync('src/pages/CccSummerHandoffPage.tsx', 'utf8');
const service = readFileSync('src/lib/cccSummerHandoffService.ts', 'utf8');
const routes = readFileSync('src/routes/publicRoutes.tsx', 'utf8');
const loginPage = readFileSync('src/pages/LoginPage.tsx', 'utf8');
const loginUrl = readFileSync('src/utils/cccSummerLogin.ts', 'utf8');
const authEntryPage = readFileSync('src/pages/AuthEntryPage.tsx', 'utf8');

test('login and signup entry ask whether the visitor has a CCC account', () => {
  assert.match(routes, /path: '\/login', element: <AuthEntryPage \/>/);
  assert.match(routes, /path: '\/signup', element: <AuthEntryPage \/>/);
  assert.match(routes, /path: '\/local-login', element: <LoginPage \/>/);
  assert.match(routes, /path: '\/local-signup', element: <SignupPage \/>/);
  assert.match(authEntryPage, /CCC 계정이 있으신가요/);
  assert.match(authEntryPage, /네, CCC 계정으로 계속하기/);
  assert.match(authEntryPage, /별도로 회원가입하기/);
  assert.match(authEntryPage, /기존 계정으로 로그인하기/);
  assert.match(authEntryPage, /getCccSummerLoginUrl/);
  assert.match(authEntryPage, /window\.location\.assign\(cccSummerLoginUrl\)/);
  assert.match(loginUrl, /VITE_CCC_SUMMER_BASE_URL/);
  assert.match(loginUrl, /VITE_CCC_SUMMER_CLIENT_ID/);
  assert.match(loginUrl, /\/api\/handoff\/authorize/);
  assert.match(loginUrl, /client_id/);
  assert.match(loginUrl, /redirect_uri/);
});

test('legacy login no longer redirects automatically to CCC Summer', () => {
  assert.doesNotMatch(loginPage, /getCccSummerLoginUrl/);
  assert.doesNotMatch(loginPage, /window\.location\.(?:assign|replace)/);
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
