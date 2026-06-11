import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const signupPage = readFileSync('src/pages/SignupPage.tsx', 'utf8');
const setupSql = readFileSync(
  'sql/setup/190_enable_signup_email_availability_check.sql',
  'utf8',
);
const migrationSql = readFileSync(
  'supabase/migrations/20260611000026_190_enable_signup_email_availability_check.sql',
  'utf8',
);

test('signup email availability setup SQL matches its migration', () => {
  assert.equal(setupSql.replaceAll('\r\n', '\n'), migrationSql.replaceAll('\r\n', '\n'));
});

test('browser signup clients can call the email existence RPC', () => {
  assert.match(
    setupSql,
    /grant execute on function public\.email_exists\(text\) to anon, authenticated/i,
  );
});

test('signup requires an email availability check before continuing', () => {
  assert.match(signupPage, /supabase\.rpc\(\s*'email_exists'/);
  assert.match(signupPage, /이미 가입된 이메일입니다/);
  assert.match(signupPage, /사용 가능한 이메일입니다/);
  assert.match(signupPage, /emailCheckStatus === 'available'/);
  assert.match(
    signupPage,
    /if \(isAlreadyRegisteredSignupError\(signUpError\)\) \{\s*setCurrentStep\(0\);\s*setEmailCheckStatus\('duplicate'\)/,
  );
});
