import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import test from 'node:test';

const migration = readFileSync(
  'sql/setup/194_explicit_high_risk_rpc_authorization.sql',
  'utf8'
);
const migrationChain = readdirSync('supabase/migrations')
  .filter((fileName) => fileName.endsWith('.sql'))
  .sort()
  .map((fileName) =>
    readFileSync(`supabase/migrations/${fileName}`, 'utf8')
  )
  .join('\n');

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
  for (const functionName of [
    'create_uncached_allocation_optimization_job',
    'execute_boarding_passenger_move',
  ]) {
    assert.match(
      migrationChain,
      new RegExp(
        `revoke all on function (?:"public"\\.|public\\.)?"?${functionName}"?\\([^\\r\\n]*from public;`,
        'i'
      ),
      `${functionName} must remain private`
    );
    assert.doesNotMatch(
      migrationChain,
      new RegExp(
        `grant all on function (?:"public"\\.|public\\.)?"?${functionName}"?\\([^\\r\\n]*to authenticated;`,
        'i'
      ),
      `${functionName} must not be granted to authenticated users`
    );
  }
});
