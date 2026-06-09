import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

test('activity logging skips requests when the authenticated user is unavailable', () => {
  const source = readFileSync('src/lib/activityLogService.ts', 'utf8');

  assert.match(
    source,
    /supabase\.auth\.getUser\(\)[\s\S]*if \(userError \|\| !userData\.user\) return;[\s\S]*record_activity_event/
  );
});
