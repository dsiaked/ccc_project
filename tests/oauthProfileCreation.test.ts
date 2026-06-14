import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const migration = fs.readFileSync(
  'supabase/migrations/20260613000001_204_extend_allocation_cancellation_timeout.sql',
  'utf8'
);

test('OAuth profile creation tolerates missing local-signup metadata', () => {
  assert.match(
    migration,
    /coalesce\(new\.raw_user_meta_data, '\{\}'::jsonb\)/
  );
  assert.match(
    migration,
    /jsonb_typeof\(v_metadata -> 'invitation_codes'\) = 'array'/
  );
  assert.match(migration, /cardinality\(v_invitation_codes\) > 0/);
  assert.match(migration, /coalesce\(v_metadata ->> 'phone', ''\)/);
  assert.match(
    migration,
    /nullif\(v_metadata ->> 'user_name', ''\),\s+''/
  );
});

test('OAuth profile creation preserves trusted account source behavior', () => {
  assert.match(migration, /'self_signup'/);
  assert.doesNotMatch(
    migration,
    /v_metadata ->> 'account_source' = 'admin_created'/
  );
});

test('OAuth profile creation installs one canonical auth trigger', () => {
  assert.match(
    migration,
    /create or replace trigger "on_auth_user_created" after insert on "auth"\."users"/i
  );
  assert.match(
    migration,
    /execute function "public"\."handle_new_auth_user"\(\);/i
  );
});
