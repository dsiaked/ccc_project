import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const readFunction = (name: string) =>
  readFileSync(`supabase/functions/${name}/index.ts`, 'utf8');

test('external Edge Function requests have bounded execution time', () => {
  const boardingRoster = readFunction('boarding-roster-google-sheet');
  const aiReport = readFunction('ai-operations-report');

  assert.match(boardingRoster, /const GOOGLE_REQUEST_TIMEOUT_MS = 15_000/);
  assert.equal(
    [...boardingRoster.matchAll(/signal: AbortSignal\.timeout\(GOOGLE_REQUEST_TIMEOUT_MS\)/g)]
      .length,
    2,
  );
  assert.match(aiReport, /const GEMINI_REQUEST_TIMEOUT_MS = 30_000/);
  assert.match(aiReport, /signal: AbortSignal\.timeout\(GEMINI_REQUEST_TIMEOUT_MS\)/);
});

test('privileged Edge Functions do not expose provider or database errors', () => {
  const boardingRoster = readFunction('boarding-roster-google-sheet');
  const aiReport = readFunction('ai-operations-report');
  const adminUserManager = readFunction('admin-user-manager');

  assert.doesNotMatch(boardingRoster, /return json\(\{ error: snapshotError\.message/);
  assert.doesNotMatch(boardingRoster, /\? syncError\.message/);
  assert.doesNotMatch(aiReport, /return json\(\{ error: message/);
  assert.doesNotMatch(adminUserManager, /\$\{profileError\.message\}/);
  assert.doesNotMatch(adminUserManager, /createError\?\.message \|\|/);
});

test('admin user creation records failed rollback without leaking details', () => {
  const adminUserManager = readFunction('admin-user-manager');

  assert.match(
    adminUserManager,
    /const \{ error: rollbackError \} = await serviceClient\.auth\.admin\.deleteUser/,
  );
  assert.match(adminUserManager, /if \(rollbackError\)/);
});
