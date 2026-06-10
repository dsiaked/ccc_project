import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const readFunction = (name: string) =>
  readFileSync(`supabase/functions/${name}/index.ts`, 'utf8');

test('CCC Summer handoff bounds the upstream code exchange request', () => {
  const source = readFunction('ccc-summer-handoff');

  assert.match(source, /const CCC_SUMMER_REQUEST_TIMEOUT_MS = 15_000/);
  assert.match(
    source,
    /signal: AbortSignal\.timeout\(CCC_SUMMER_REQUEST_TIMEOUT_MS\)/,
  );
});

test('allocation launcher bounds Google token and Cloud Run requests', () => {
  const source = readFunction('allocation-optimizer-launcher');

  assert.match(source, /const GOOGLE_REQUEST_TIMEOUT_MS = 15_000/);
  assert.equal(
    [
      ...source.matchAll(
        /signal: AbortSignal\.timeout\(GOOGLE_REQUEST_TIMEOUT_MS\)/g,
      ),
    ].length,
    2,
  );
});

test('CCC Summer handoff rolls back a newly created account after sync failure', () => {
  const source = readFunction('ccc-summer-handoff');

  assert.match(source, /let createdUserId = ''/);
  assert.match(source, /createdUserId = data\.user\.id/);
  assert.match(
    source,
    /if \(profileError \|\| linkUpsertError\) \{[\s\S]*if \(createdUserId\) \{[\s\S]*serviceClient\.auth\.admin\.deleteUser\(createdUserId\)/,
  );
});
