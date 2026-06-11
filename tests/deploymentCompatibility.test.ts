import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const compatibility = JSON.parse(
  readFileSync('deployment-compatibility.json', 'utf8')
) as { requiredDatabaseVersion: number };
const setupSql = readFileSync(
  'sql/setup/186_public_contact_info.sql',
  'utf8'
);
const migrationSql = readFileSync(
  'supabase/migrations/20260611000021_186_public_contact_info.sql',
  'utf8'
);
const checker = readFileSync('scripts/check-supabase-deployment.mjs', 'utf8');
const anonRlsChecker = readFileSync('scripts/check-supabase-anon-rls.mjs', 'utf8');
const packageJson = readFileSync('package.json', 'utf8');
const mergeWorkflow = readFileSync(
  '.github/workflows/firebase-hosting-merge.yml',
  'utf8'
);

test('deployment compatibility version is exposed without privileged credentials', () => {
  assert.equal(compatibility.requiredDatabaseVersion, 186);
  assert.equal(migrationSql, setupSql);
  assert.match(setupSql, /select 186;/);
  assert.match(
    setupSql,
    /assert_deployment_compatibility[\s\S]*v_deployed_version constant integer := 186;/i
  );
  assert.match(setupSql, /revoke all[\s\S]*from public;/);
  assert.match(setupSql, /grant execute[\s\S]*to anon, authenticated, service_role;/);
  assert.doesNotMatch(checker, /SERVICE_ROLE/);
  assert.match(checker, /assert_deployment_compatibility/);
  assert.match(checker, /p_required_version: requiredDatabaseVersion/);
  assert.match(checker, /AbortSignal\.timeout\(15_000\)/);
});

test('anonymous deployment checks cannot expose service-only tables', () => {
  assert.match(packageJson, /"deploy:check:rls":\s*"node scripts\/check-supabase-anon-rls\.mjs"/);
  assert.match(anonRlsChecker, /ccc_summer_user_links/);
  assert.match(anonRlsChecker, /ai_report_log_settings/);
  assert.match(anonRlsChecker, /allocation_optimization_jobs/);
  assert.match(anonRlsChecker, /rows\.length !== 0/);
  assert.doesNotMatch(anonRlsChecker, /SERVICE_ROLE/);
  assert.doesNotMatch(anonRlsChecker, /method:\s*['"](?:POST|PATCH|DELETE)['"]/);
});

test('live Firebase deployment checks Supabase compatibility before deploy', () => {
  assert.match(packageJson, /"deploy:check:supabase":\s*"node scripts\/check-supabase-deployment\.mjs"/);

  const checkIndex = mergeWorkflow.indexOf('npm run deploy:check:supabase');
  const deployIndex = mergeWorkflow.indexOf('FirebaseExtended/action-hosting-deploy@v0');

  assert.notEqual(checkIndex, -1, 'Missing Supabase deployment compatibility check.');
  assert.notEqual(deployIndex, -1, 'Missing Firebase live deployment action.');
  assert.ok(checkIndex < deployIndex, 'Supabase compatibility must be checked before Firebase deploy.');
});

test('live Firebase deployment updates the AI report Edge Function before hosting', () => {
  const functionDeployIndex = mergeWorkflow.indexOf(
    'supabase functions deploy ai-operations-report'
  );
  const deployIndex = mergeWorkflow.indexOf('FirebaseExtended/action-hosting-deploy@v0');

  assert.match(mergeWorkflow, /SUPABASE_ACCESS_TOKEN: \$\{\{ secrets\.SUPABASE_ACCESS_TOKEN \}\}/);
  assert.match(mergeWorkflow, /if: \$\{\{ env\.SUPABASE_ACCESS_TOKEN != '' \}\}/);
  assert.notEqual(functionDeployIndex, -1, 'Missing AI report Edge Function deployment.');
  assert.match(mergeWorkflow, /supabase functions deploy allocation-optimizer-launcher/);
  assert.match(mergeWorkflow, /supabase functions deploy ccc-summer-handoff/);
  assert.ok(functionDeployIndex < deployIndex, 'Edge Function must deploy before Firebase Hosting.');
});
