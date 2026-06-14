import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const migration = readFileSync(
  'sql/setup/156_ai_operations_reports.sql',
  'utf8'
);
const simulationAttributionMigration = readFileSync(
  'sql/setup/167_attribute_simulation_user_activity.sql',
  'utf8'
);
const simulationAttributionBackfill = readFileSync(
  'sql/setup/170_backfill_simulation_user_activity.sql',
  'utf8'
);
const edgeFunction = readFileSync(
  'supabase/functions/ai-operations-report/index.ts',
  'utf8'
);
const app = readFileSync('src/App.tsx', 'utf8');
const routes = readFileSync('src/routes/adminRoutes.tsx', 'utf8');
const tools = readFileSync('src/pages/admin/AdminToolsPage.tsx', 'utf8');
const reportPage = readFileSync(
  'src/pages/admin/AdminAiOperationsReportsPage.tsx',
  'utf8'
);
const activityLogsPage = readFileSync(
  'src/pages/admin/AdminAiActivityLogsPage.tsx',
  'utf8'
);
const selectionMigration = readFileSync(
  'sql/setup/166_ai_report_log_selection.sql',
  'utf8'
);
const globalAdminActivityMigration = readFileSync(
  'sql/setup/175_skip_global_admin_activity_logs.sql',
  'utf8'
);

test('activity logging is authenticated, metadata-limited, and globally reviewable', () => {
  assert.match(migration, /create table if not exists public\.activity_event_logs/i);
  assert.match(migration, /create or replace function public\.record_activity_event/i);
  assert.match(migration, /item\.key in \(/i);
  assert.match(migration, /public\.is_global_admin\(\)/i);
  assert.match(app, /<ActivityTracker \/>/);
});

test('AI reports are anonymized and restricted to global administrators', () => {
  assert.match(migration, /create table if not exists public\.ai_operations_reports/i);
  assert.match(migration, /anonymized boolean not null default true/i);
  assert.match(edgeFunction, /\.eq\('role', 'global_admin'\)/);
  assert.doesNotMatch(edgeFunction, /\.from\('profiles'\)/);
  assert.match(edgeFunction, /anonymizedLogSummary/);
  assert.match(edgeFunction, /status: 'failed',[\s\S]*input_summary: summary/);
});

test('simulation personal activity is attributed to each simulation user', () => {
  assert.match(
    simulationAttributionMigration,
    /tg_table_name in \('profiles', 'reservations', 'payments'\)/
  );
  assert.match(
    simulationAttributionMigration,
    /simulation_user\.raw_user_meta_data \? 'sim_seq'/
  );
  assert.match(simulationAttributionMigration, /v_actor_id := v_subject_id/);
  assert.match(simulationAttributionMigration, /v_actor_kind := 'user'/);
  assert.match(
    simulationAttributionMigration,
    /after insert or update or delete on public\.profiles/
  );
  assert.match(
    simulationAttributionBackfill,
    /update public\.activity_event_logs activity[\s\S]*actor_id = resource\.actor_id[\s\S]*actor_kind = 'user'/
  );
});

test('global administrators only remain in management audit logs', () => {
  assert.match(
    globalAdminActivityMigration,
    /admin_role\.role = 'global_admin'[\s\S]*return null;/
  );
  assert.match(
    globalAdminActivityMigration,
    /admin_role\.role = 'global_admin'[\s\S]*return case when tg_op = 'DELETE' then old else new end;/
  );
  assert.match(
    globalAdminActivityMigration,
    /delete from public\.activity_event_logs activity[\s\S]*admin_role\.role = 'global_admin'/
  );
  assert.match(globalAdminActivityMigration, /admin_action_audit_logs/);
  assert.doesNotMatch(
    globalAdminActivityMigration,
    /delete from public\.admin_action_audit_logs/
  );
});

test('AI reports use Gemini without exposing the API key in the request URL', () => {
  assert.match(edgeFunction, /Deno\.env\.get\('GEMINI_API_KEY'\)/);
  assert.match(edgeFunction, /gemini-2\.5-flash-lite/);
  assert.match(edgeFunction, /generativelanguage\.googleapis\.com\/v1beta\/models/);
  assert.match(edgeFunction, /'x-goog-api-key': geminiApiKey/);
  assert.doesNotMatch(edgeFunction, /api\.openai\.com|OPENAI_API_KEY/);
});

test('Gemini report generation retries temporary capacity failures', () => {
  assert.match(edgeFunction, /fetchGeminiWithRetry/);
  assert.match(edgeFunction, /status === 503/);
  assert.match(edgeFunction, /for \(const delay of \[1000, 2500\]\)/);
});

test('global administrators can open the AI operations report screen', () => {
  assert.match(routes, /path: 'system\/ai-reports'/);
  assert.match(routes, /<AdminAiOperationsReportsPage \/>/);
  assert.match(tools, /path: '\/admin\/system\/ai-reports'/);
});

test('global administrators choose which logs are included in AI reports', () => {
  assert.match(selectionMigration, /create table if not exists public\.ai_report_log_settings/i);
  assert.match(selectionMigration, /create or replace function public\.update_ai_report_log_settings/i);
  assert.match(selectionMigration, /public\.is_global_admin\(\)/i);
  assert.match(edgeFunction, /\.from\('ai_report_log_settings'\)/);
  assert.match(edgeFunction, /\.in\('category', activityCategories\)/);
  assert.match(reportPage, /updateAiReportLogSettings/);
  assert.match(reportPage, /getAiReportLogSettings/);
});

test('AI report log settings stay read-only until the saved configuration loads', () => {
  assert.match(reportPage, /useState\(true\)/);
  assert.match(reportPage, /const \[settingsLoading, setSettingsLoading\] = useState\(true\)/);
  assert.match(reportPage, /aria-busy=\{settingsLoading\}/);
  assert.match(reportPage, /setSettingsLoading\(false\)/);
  assert.match(reportPage, /disabled=\{savingSettings\}/);
});

test('AI report log settings recover from an initial fetch failure inside the panel', () => {
  assert.match(reportPage, /const loadSettings = useCallback\(async \(\) =>/);
  assert.match(reportPage, /setSettingsError\(null\)/);
  assert.match(reportPage, /className=\{styles\.settingsError\} role="alert"/);
  assert.match(reportPage, /onClick=\{\(\) => void loadSettings\(\)\}/);
  assert.match(reportPage, /settings === null \? \(/);
});

test('global administrators can review collected AI activity logs', () => {
  assert.match(routes, /path: 'system\/ai-reports\/logs'/);
  assert.match(routes, /<AdminAiActivityLogsPage \/>/);
  assert.match(tools, /path: '\/admin\/system\/ai-reports\/logs'/);
  assert.match(activityLogsPage, /getActivityEventLogs/);
  assert.match(activityLogsPage, /getAdminAuditLogs/);
  assert.match(activityLogsPage, /type LogSource = 'activity' \| 'adminAudit'/);
  assert.match(activityLogsPage, /updateSource\('adminAudit'\)/);
  assert.match(activityLogsPage, /관리 감사 기록/);
  assert.match(activityLogsPage, /const AdminAiActivityLogsPage = \(\) =>/);
});
