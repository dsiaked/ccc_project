import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import test from 'node:test';

const migrations = readdirSync('supabase/migrations')
  .filter((fileName) => fileName.endsWith('.sql'))
  .sort();

test('supabase migrations are the ordered deployable schema source', () => {
  const versions = new Set<string>();

  for (const migration of migrations) {
    const match = migration.match(/^(\d{14})_[a-z0-9_]+\.sql$/);
    assert.ok(match, `${migration} has an invalid migration filename`);
    assert.ok(!versions.has(match[1]), `${migration} has a duplicate version`);
    versions.add(match[1]);
  }

  const generator = readFileSync(
    'scripts/sync-combined-supabase-setup.mjs',
    'utf8'
  );
  assert.match(generator, /const migrationDirectory = 'supabase\/migrations'/);
  assert.doesNotMatch(generator, /sql\/setup/);
});

test('reservation normalization starts with a non-destructive expand and backfill', () => {
  const migration = readFileSync(
    'supabase/migrations/20260613000008_211_expand_reservation_normalization.sql',
    'utf8'
  );

  assert.match(migration, /add column if not exists organization_snapshot jsonb/i);
  assert.match(migration, /add column if not exists extra_data jsonb/i);
  assert.match(migration, /update public\.reservations[\s\S]*organization_snapshot/i);
  assert.match(migration, /data - array\[/i);
  assert.match(migration, /create trigger zy_initialize_reservation_normalized_storage/i);
  assert.doesNotMatch(migration, /drop column/i);
});
