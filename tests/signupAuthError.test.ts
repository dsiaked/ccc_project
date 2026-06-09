import assert from 'node:assert/strict';
import test from 'node:test';

import { isAlreadyRegisteredSignupError } from '../src/utils/signupAuthError.js';

test('recognizes Supabase duplicate signup error codes', () => {
  assert.equal(
    isAlreadyRegisteredSignupError({
      code: 'user_already_exists',
      message: 'A user with this email address has already been registered',
    }),
    true
  );
  assert.equal(
    isAlreadyRegisteredSignupError({
      code: 'email_exists',
      message: 'Email address already exists',
    }),
    true
  );
});

test('recognizes the legacy duplicate signup message', () => {
  assert.equal(
    isAlreadyRegisteredSignupError({
      message: 'User already registered',
      status: 422,
    }),
    true
  );
});

test('does not treat unrelated signup failures as duplicate accounts', () => {
  assert.equal(
    isAlreadyRegisteredSignupError({
      code: 'over_email_send_rate_limit',
      message: 'Email rate limit exceeded',
    }),
    false
  );
  assert.equal(isAlreadyRegisteredSignupError(new Error('Network error')), false);
  assert.equal(isAlreadyRegisteredSignupError(null), false);
});
