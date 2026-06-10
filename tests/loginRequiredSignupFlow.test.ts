import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const loginRequiredModal = readFileSync(
  'src/components/LoginRequiredModal.tsx',
  'utf8'
);
const reservationPage = readFileSync('src/pages/ReservationPage.tsx', 'utf8');
const loginPage = readFileSync('src/pages/LoginPage.tsx', 'utf8');
const signupPage = readFileSync('src/pages/SignupPage.tsx', 'utf8');

test('login-required users can choose signup without losing their destination', () => {
  assert.match(loginRequiredModal, /onSignup: \(\) => void/);
  assert.match(loginRequiredModal, /처음이신가요\? 회원가입/);
  assert.match(
    reservationPage,
    /navigate\('\/signup',[\s\S]*createLoginRequiredRedirectState\('\/reservation'\)/
  );
  assert.match(loginPage, /to="\/signup"[\s\S]*state=\{\{ from: redirectTo \}\}/);
});

test('completed signup returns to the requested protected page', () => {
  assert.match(signupPage, /normalizeAppRedirect\(location\.state\?\.from\)/);
  assert.match(
    signupPage,
    /if \(redirectTo !== '\/'\) \{[\s\S]*navigate\(redirectTo, \{ replace: true \}\)/
  );
  assert.match(
    signupPage,
    /navigate\('\/login',[\s\S]*email: email\.trim\(\)\.toLowerCase\(\),[\s\S]*from: redirectTo/
  );
});
