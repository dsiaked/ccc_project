import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const adminAuthProvider = readFileSync(
  'src/components/AdminAuthProvider.tsx',
  'utf8'
);
const adminRoutes = readFileSync('src/routes/adminRoutes.tsx', 'utf8');
const adminProtectedRoute = readFileSync(
  'src/components/AdminProtectedRoute.tsx',
  'utf8'
);
const loginPage = readFileSync('src/pages/LoginPage.tsx', 'utf8');
const supabaseClient = readFileSync('src/lib/supabase.ts', 'utf8');

test('Supabase browser sessions persist and refresh without another login', () => {
  assert.match(supabaseClient, /persistSession:\s*true/);
  assert.match(supabaseClient, /autoRefreshToken:\s*true/);
  assert.match(supabaseClient, /detectSessionInUrl:\s*true/);
});

test('admin auth refreshes the cached role on every non-initial auth event', () => {
  assert.match(adminAuthProvider, /clearAdminRoleCache\(resolvedSession\.user\.id\)/);
  assert.match(adminAuthProvider, /if \(event === 'INITIAL_SESSION'\) return/);
  assert.match(adminAuthProvider, /void loadAdminAuth\(nextSession\)/);
});

test('administrator login uses the ordinary login screen and preserves the target', () => {
  assert.match(adminRoutes, /path: 'login', element: <AdminLoginRedirect \/>/);
  assert.match(adminRoutes, /return <Navigate to="\/login" replace state=\{\{ from \}\} \/>/);
  assert.match(adminProtectedRoute, /to="\/login"[\s\S]*location\.pathname/);
  assert.doesNotMatch(loginPage, /to="\/admin\/login"/);
});

test('the separate administrator login form is not routed', () => {
  assert.doesNotMatch(adminRoutes, /AdminLoginPage/);
  assert.doesNotMatch(loginPage, /관리자·탑승 관리 간사님 로그인/);
});
