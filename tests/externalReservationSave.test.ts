import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const migration = readFileSync(
  'supabase/migrations/20260617000001_229_external_user_reservation_save.sql',
  'utf8'
);

test('public reservation save supports external district users without a team', () => {
  assert.match(
    migration,
    /create or replace function public\.save_user_reservation_without_opening_check/i
  );
  assert.match(
    migration,
    /case when p_data ->> 'affiliationType' = 'external' then 'external' else 'seoul' end/i
  );
  assert.match(
    migration,
    /or \(v_affiliation_type = 'seoul' and nullif\(trim\(p_team\), ''\) is null\)/i
  );
  assert.doesNotMatch(
    migration,
    /or \(v_affiliation_type = 'external'[\s\S]*nullif\(trim\(p_team\), ''\) is null/i
  );
  assert.match(
    migration,
    /case when v_affiliation_type = 'external' then '' else trim\(p_team\) end/i
  );
});
