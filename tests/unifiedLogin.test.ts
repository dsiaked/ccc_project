import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';

const adminRoutes = readFileSync('src/routes/adminRoutes.tsx', 'utf8');
const loginPage = readFileSync('src/pages/LoginPage.tsx', 'utf8');

test('public and administrator accounts share one login entry point', () => {
  assert.equal(existsSync('src/pages/admin/AdminLoginPage.tsx'), false);
  assert.match(adminRoutes, /AdminLoginRedirect/);
  assert.match(adminRoutes, /<Navigate to="\/login" replace state=\{\{ from \}\} \/>/);
  assert.doesNotMatch(loginPage, /adminLoginSection|\/admin\/login/);
});
