import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const modal = readFileSync('src/components/LoginRequiredModal.tsx', 'utf8');
const reservation = readFileSync('src/pages/ReservationPage.tsx', 'utf8');
const login = readFileSync('src/pages/LoginPage.tsx', 'utf8');
const signup = readFileSync('src/pages/SignupPage.tsx', 'utf8');

test('login-required signup preserves the requested page', () => {
  assert.match(modal, /처음이신가요\? 회원가입/);
  assert.match(reservation, /navigate\('\/signup',[\s\S]*'\/reservation'/);
  assert.match(login, /to="\/signup"[\s\S]*from: redirectTo/);
  assert.match(signup, /normalizeAppRedirect\(location\.state\?\.from\)/);
  assert.match(signup, /navigate\(redirectTo, \{ replace: true \}\)/);
});
