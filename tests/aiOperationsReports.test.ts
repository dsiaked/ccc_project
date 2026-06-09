import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const migration = readFileSync(
  'supabase/migrations/20260610230017_156_ai_operations_reports.sql',
  'utf8'
);
const edgeFunction = readFileSync(
  'supabase/functions/ai-operations-report/index.ts',
  'utf8'
);
const app = readFileSync('src/App.tsx', 'utf8');
const routes = readFileSync('src/routes/adminRoutes.tsx', 'utf8');
const tools = readFileSync('src/pages/admin/AdminToolsPage.tsx', 'utf8');

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

test('AI reports use Gemini without exposing the API key in the request URL', () => {
  assert.match(edgeFunction, /Deno\.env\.get\('GEMINI_API_KEY'\)/);
  assert.match(edgeFunction, /gemini-2\.5-flash/);
  assert.match(edgeFunction, /generativelanguage\.googleapis\.com\/v1beta\/models/);
  assert.match(edgeFunction, /'x-goog-api-key': geminiApiKey/);
  assert.doesNotMatch(edgeFunction, /api\.openai\.com|OPENAI_API_KEY/);
});

test('global administrators can open the AI operations report screen', () => {
  assert.match(routes, /path: 'system\/ai-reports'/);
  assert.match(routes, /<AdminAiOperationsReportsPage \/>/);
  assert.match(tools, /path: '\/admin\/system\/ai-reports'/);
});
