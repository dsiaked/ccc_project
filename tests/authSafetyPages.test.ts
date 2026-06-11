import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const invitationPage = readFileSync('src/pages/InvitationCodePage.tsx', 'utf8');
const resetPasswordPage = readFileSync('src/pages/ResetPasswordPage.tsx', 'utf8');
const authCallbackPage = readFileSync('src/pages/AuthCallbackPage.tsx', 'utf8');

test('invitation codes require a separate preview and final redemption action', () => {
  assert.match(invitationPage, /setValidatedCodes\(codes\)/);
  assert.match(invitationPage, /const handleRedeem = async/);
  assert.match(invitationPage, /await redeemInvitationCodes\(validatedCodes\)/);
  assert.match(invitationPage, /type="button"[\s\S]*확인한 권한 최종 등록/);
  assert.doesNotMatch(invitationPage, /handleValidate\(\)[\s\S]*redeemInvitationCodes/);
});

test('password changes are limited to verified recovery sessions', () => {
  assert.match(resetPasswordPage, /event === 'PASSWORD_RECOVERY'/);
  assert.match(resetPasswordPage, /exchangeCodeForSession\(recoveryCode\)/);
  assert.match(resetPasswordPage, /const recoveryAccessToken = hashParams\.get\('access_token'\)/);
  assert.match(resetPasswordPage, /supabase\.auth\.getUser\(accessToken\)/);
  assert.match(
    resetPasswordPage,
    /data\.session\.access_token !== recoveryAccessToken/
  );
  assert.match(resetPasswordPage, /recoveryStatus !== 'valid'/);
  assert.match(resetPasswordPage, /userData\.user\?\.id !== recoveryUserId/);
  assert.match(resetPasswordPage, /to="\/forgot-password"/);
});

test('auth callback never reports success without callback evidence and a verified user', () => {
  assert.match(authCallbackPage, /const hasCallbackEvidence =/);
  assert.match(authCallbackPage, /if \(!hasCallbackEvidence\)/);
  assert.match(authCallbackPage, /exchangeCodeForSession\(callbackCode\)/);
  assert.match(authCallbackPage, /supabase\.auth\.getUser\(accessToken\)/);
  assert.match(authCallbackPage, /session\.access_token !== callbackAccessToken/);
  assert.match(authCallbackPage, /setStatus\('success'\)/);
  assert.match(authCallbackPage, /to="\/forgot-password"/);
});
