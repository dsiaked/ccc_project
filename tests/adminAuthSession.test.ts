import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const adminAuthProvider = readFileSync(
  'src/components/AdminAuthProvider.tsx',
  'utf8'
);
const adminLoginPage = readFileSync('src/pages/admin/AdminLoginPage.tsx', 'utf8');
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

test('admin login redirects an already authenticated administrator', () => {
  assert.match(adminLoginPage, /useAdminAuth\(\)/);
  assert.match(
    adminLoginPage,
    /status !== 'authenticated' \|\| !adminRole/
  );
  assert.match(adminLoginPage, /getAdminFallbackPath\(adminRole\.role\)/);
});

test('admin login rejects duplicate submissions before another auth request', () => {
  assert.match(adminLoginPage, /if \(loginRequestRef\.current\) return/);
  assert.match(adminLoginPage, /clearOAuthCallbackState\(\)[\s\S]*signInWithPassword/);
  assert.match(
    adminLoginPage,
    /loginRequestRef\.current = true[\s\S]*signInWithPassword/
  );
  assert.match(
    adminLoginPage,
    /finally \{[\s\S]*loginRequestRef\.current = false/
  );
});
