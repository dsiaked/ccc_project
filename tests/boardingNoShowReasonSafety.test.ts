import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const service = readFileSync(
  'src/lib/admin/boardingManagementService.ts',
  'utf8'
);
const migration = readFileSync(
  'supabase/migrations/20260611000022_186_require_reason_for_every_no_show.sql',
  'utf8'
);

test('every manual no-show requires a reason on the server', () => {
  assert.match(migration, /if p_status = ''no_show'' and v_reason is null then/);
  assert.match(migration, /A no-show reason is required\./);
  assert.match(
    migration,
    /if v_updated_definition = v_definition then[\s\S]*Could not enforce the passenger no-show reason requirement\./
  );
  assert.match(
    migration,
    /if v_updated_definition = v_definition then[\s\S]*Could not enforce the walk-in no-show reason requirement\./
  );
});

test('client never falls back to a legacy no-show RPC', () => {
  assert.match(
    service,
    /if \(status === 'no_show' && !reason\.trim\(\)\) \{[\s\S]*미탑승 사유를 반드시 입력해주세요\./
  );
  assert.match(
    service,
    /if \(reason\.trim\(\)\) \{[\s\S]*boardingTransitionReasonUpgradeMessage/
  );
  assert.doesNotMatch(
    service,
    /legacyError\.message\.includes\('No-show status is available after bus departure'\)/
  );
});
