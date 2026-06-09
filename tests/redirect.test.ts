import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createLoginRequiredRedirectState,
  decodeUrlComponentSafely,
  normalizeAppRedirect,
} from '../src/utils/redirect.js';

test('normalizes login redirects to internal application paths', () => {
  assert.equal(normalizeAppRedirect('/ticket?tab=details'), '/ticket?tab=details');
  assert.equal(normalizeAppRedirect(' /reservation '), '/reservation');
  assert.equal(normalizeAppRedirect('https://example.com'), '/');
  assert.equal(normalizeAppRedirect('//example.com'), '/');
  assert.equal(normalizeAppRedirect(null, '/login'), '/login');
});

test('malformed callback errors remain renderable', () => {
  assert.equal(decodeUrlComponentSafely('Email%20expired'), 'Email expired');
  assert.equal(decodeUrlComponentSafely('%E0%A4%A'), '%E0%A4%A');
});

test('creates an internal redirect after confirming the login-required modal', () => {
  const state = createLoginRequiredRedirectState('/reservation');

  assert.deepEqual(state, {
    from: '/reservation',
    loginRequired: true,
  });
  assert.deepEqual(createLoginRequiredRedirectState('https://example.com'), {
    from: '/',
    loginRequired: true,
  });
});
