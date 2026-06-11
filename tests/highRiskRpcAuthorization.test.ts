import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const migration = readFileSync(
  'supabase/migrations/20260611000030_194_explicit_high_risk_rpc_authorization.sql',
  'utf8'
);

const getFunctionBody = (functionName: string) => {
  const match = migration.match(
    new RegExp(
      `create or replace function public\\.${functionName}\\([\\s\\S]*?\\n\\$\\$;`,
      'i'
    )
  );

  assert.ok(match, `${functionName} definition is missing`);
  return match[0];
};

test('high-risk public RPCs enforce global-admin authorization directly', () => {
  for (const functionName of [
    'bulk_manage_personal_user_payments',
    'bulk_send_personal_notifications',
    'create_allocation_optimization_job_for_execution',
    'create_detailed_allocation_optimization_job_for_execution',
  ]) {
    assert.match(
      getFunctionBody(functionName),
      /if not public\.is_global_admin\(\) then/i,
      `${functionName} must not rely only on nested helper authorization`
    );
  }
});

test('high-risk public RPCs are unavailable to anonymous roles', () => {
  for (const functionName of [
    'bulk_manage_personal_user_payments',
    'bulk_send_personal_notifications',
    'create_allocation_optimization_job_for_execution',
    'create_detailed_allocation_optimization_job_for_execution',
  ]) {
    assert.match(
      migration,
      new RegExp(
        `revoke all on function public\\.${functionName}\\([\\s\\S]*?from public, anon;`,
        'i'
      )
    );
  }
});

test('internal privilege-bearing helpers remain unavailable to authenticated users', () => {
  const combined = readFileSync('sql/setup/combined_supabase_setup.sql', 'utf8');

  for (const functionName of [
    'create_uncached_allocation_optimization_job',
    'create_uncached_detailed_allocation_optimization_job',
    'execute_boarding_passenger_move',
  ]) {
    assert.match(
      combined,
      new RegExp(
        `revoke all on function public\\.${functionName}\\([\\s\\S]*?from public, anon, authenticated;`,
        'i'
      ),
      `${functionName} must remain private`
    );
  }
});
