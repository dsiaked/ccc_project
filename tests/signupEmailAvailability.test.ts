import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const signupPage = readFileSync('src/pages/SignupPage.tsx', 'utf8');
const setupSql = readFileSync(
  'sql/setup/149_disable_signup_email_enumeration.sql',
  'utf8',
);
const migrationSql = readFileSync(
  'supabase/migrations/20260610230010_149_disable_signup_email_enumeration.sql',
  'utf8',
);

test('signup email-enumeration setup SQL matches its migration', () => {
  assert.equal(setupSql, migrationSql);
});

test('browser signup clients cannot call the email existence RPC', () => {
  assert.match(
    setupSql,
    /revoke all on function public\.email_exists\(text\) from public, anon, authenticated/i,
  );
});

test('signup does not reveal whether an email is already registered', () => {
  assert.doesNotMatch(signupPage, /supabase\.rpc\(\s*'email_exists'/);
  assert.doesNotMatch(signupPage, /이미 가입된 이메일입니다/);
  assert.doesNotMatch(signupPage, /emailCheckStatus/);
  assert.match(
    signupPage,
    /if \(isAlreadyRegisteredSignupError\(signUpError\)\) \{\s*clearSignupDraft\(\);\s*setSignupResult\('verification-required'\)/,
  );
});
