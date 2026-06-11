import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const signupPage = readFileSync('src/pages/SignupPage.tsx', 'utf8');
const setupSql = readFileSync(
  'sql/setup/188_enable_signup_email_duplicate_check.sql',
  'utf8',
);
const migrationSql = readFileSync(
  'supabase/migrations/20260611000023_188_enable_signup_email_duplicate_check.sql',
  'utf8',
);

test('signup duplicate-check setup SQL matches its migration', () => {
  assert.equal(setupSql.replaceAll('\r\n', '\n'), migrationSql.replaceAll('\r\n', '\n'));
});

test('browser signup clients can call the email existence RPC', () => {
  assert.match(
    setupSql,
    /grant execute on function public\.email_exists\(text\) to anon, authenticated/i,
  );
});

test('signup requires a successful email duplicate check before continuing', () => {
  assert.match(signupPage, /supabase\.rpc\('email_exists'/);
  assert.match(signupPage, /이미 가입된 이메일입니다/);
  assert.match(signupPage, /사용 가능한 이메일입니다/);
  assert.match(signupPage, /emailCheckStatus !== 'available'/);
  assert.match(signupPage, /setEmailCheckStatus\('idle'\)/);
  assert.match(signupPage, /emailCheckStatus === 'checking' \? '확인 중\.\.\.' : '중복확인'/);
});
