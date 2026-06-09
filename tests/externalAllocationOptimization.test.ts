import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const migration = readFileSync(
  'supabase/migrations/20260610190001_136_allow_external_reservations_without_team.sql',
  'utf8'
);

test('external reservations without teams can enter optimizer snapshots', () => {
  const externalTeamFallback =
    /coalesce\(\s*nullif\(reservation\.data ->> 'team', ''\),\s*nullif\(reservation\.team, ''\),\s*case when reservation\.affiliation_type = 'external' then '-' end\s*\) as team/gi;

  assert.equal(
    [...migration.matchAll(externalTeamFallback)].length,
    2,
    'validation and snapshot creation must use the same external-team fallback'
  );
});

test('optimizer snapshots still reject missing Seoul organization data', () => {
  assert.match(
    migration,
    /where normalized\.campus is null\s+or normalized\.team is null/i
  );
  assert.doesNotMatch(
    migration,
    /case when reservation\.affiliation_type = 'seoul' then '-' end/i
  );
});
