import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const signupPage = readFileSync('src/pages/SignupPage.tsx', 'utf8');
const availabilityMigration = readFileSync(
  'supabase/migrations/20260610200001_137_enable_signup_email_availability_check.sql',
  'utf8'
);

test('signup requires a successful email availability check before continuing', () => {
  assert.match(
    signupPage,
    /supabase\.rpc\(\s*'email_exists',\s*\{ p_email: normalizedEmail \}/
  );
  assert.match(signupPage, /emailCheckStatus !== 'available'/);
  assert.match(signupPage, /disabled=\{emailCheckStatus !== 'available'\}/);
  assert.match(
    signupPage,
    /if \(currentStep === 0\) \{\s*handleNextStep\(\);\s*return;\s*\}/
  );
  assert.match(signupPage, /사용 가능한 이메일입니다/);
  assert.match(signupPage, /이미 가입된 이메일입니다/);
});

test('browser signup clients can call the email availability RPC', () => {
  assert.match(
    availabilityMigration,
    /grant execute on function public\.email_exists\(text\) to anon, authenticated/i
  );
});
