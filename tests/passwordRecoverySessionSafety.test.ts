import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const resetPasswordPage = readFileSync(
  'src/pages/ResetPasswordPage.tsx',
  'utf8'
);

test('a recovery code must be exchanged before an existing session can be accepted', () => {
  const recoveryCodeBranch = resetPasswordPage.indexOf('if (recoveryCode) {');
  const existingSessionBranch = resetPasswordPage.indexOf('if (data.session) {');

  assert.notEqual(recoveryCodeBranch, -1);
  assert.notEqual(existingSessionBranch, -1);
  assert.ok(
    recoveryCodeBranch < existingSessionBranch,
    'an existing login session must not bypass recovery-code exchange'
  );
  assert.match(
    resetPasswordPage,
    /if \(recoveryCode\) \{[\s\S]*?exchangeCodeForSession\(recoveryCode\)[\s\S]*?verifyRecoverySession\(exchangeData\.session\);[\s\S]*?return;[\s\S]*?if \(data\.session\) \{/
  );
});

test('recovery auth events remain valid recovery evidence', () => {
  assert.match(
    resetPasswordPage,
    /event === 'PASSWORD_RECOVERY'[\s\S]*?verifyRecoverySession\(session\)/
  );
});
