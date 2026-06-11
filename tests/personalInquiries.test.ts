import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const setupSql = readFileSync('sql/setup/187_personal_inquiries.sql', 'utf8');
const migrationSql = readFileSync(
  'supabase/migrations/20260611000023_187_personal_inquiries.sql',
  'utf8'
);
const enhancementSetupSql = readFileSync(
  'sql/setup/188_personal_inquiry_workflow_enhancements.sql',
  'utf8'
);
const enhancementMigrationSql = readFileSync(
  'supabase/migrations/20260611000024_188_personal_inquiry_workflow_enhancements.sql',
  'utf8'
);
const realtimeRlsSql = readFileSync(
  'sql/setup/191_personal_inquiry_realtime_rls.sql',
  'utf8'
);
const service = readFileSync('src/lib/personalInquiryService.ts', 'utf8');
const userPage = readFileSync('src/pages/PersonalInquiryPage.tsx', 'utf8');
const adminPage = readFileSync(
  'src/pages/admin/AdminPersonalInquiriesPage.tsx',
  'utf8'
);
const publicRoutes = readFileSync('src/routes/publicRoutes.tsx', 'utf8');
const adminRoutes = readFileSync('src/routes/adminRoutes.tsx', 'utf8');
const sidebar = readFileSync('src/components/Sidebar.tsx', 'utf8');
const communications = readFileSync(
  'src/pages/admin/AdminCampusRequestsPage.tsx',
  'utf8'
);

test('personal inquiry setup SQL matches its migration', () => {
  assert.equal(
    migrationSql.replaceAll('\r\n', '\n'),
    setupSql.replaceAll('\r\n', '\n')
  );
});

test('personal inquiry workflow enhancement matches its migration', () => {
  assert.equal(
    enhancementMigrationSql.replaceAll('\r\n', '\n'),
    enhancementSetupSql.replaceAll('\r\n', '\n')
  );
});

test('personal inquiries are private and use authenticated RPCs', () => {
  assert.match(setupSql, /alter table public\.personal_inquiries enable row level security/i);
  assert.match(setupSql, /revoke all on table public\.personal_inquiries from public, anon, authenticated/i);
  assert.match(setupSql, /create_personal_inquiry/);
  assert.match(setupSql, /get_my_personal_inquiries/);
  assert.match(setupSql, /get_personal_inquiries_as_global_admin/);
  assert.match(setupSql, /respond_to_personal_inquiry/);
  assert.match(setupSql, /insert into public\.personal_notifications/i);
  assert.match(setupSql, /'inquiry'/);
});

test('personal users can open inquiries and view answers', () => {
  assert.match(service, /createPersonalInquiry/);
  assert.match(service, /getMyPersonalInquiries/);
  assert.match(userPage, /문의하기/);
  assert.match(userPage, /내 문의 내역/);
  assert.match(userPage, /관리자 답변/);
  assert.match(publicRoutes, /path: '\/inquiries'/);
  assert.match(sidebar, /handleProtectedMenuClick\('\/inquiries'\)/);
});

test('global administrators can process personal inquiries', () => {
  assert.match(service, /respondToPersonalInquiry/);
  assert.match(adminPage, /개인 문의 처리/);
  assert.match(adminPage, /관리자 답변/);
  assert.match(adminPage, /status === 'resolved'/);
  assert.match(adminRoutes, /path: 'communications\/personal'/);
  assert.match(communications, /navigate\('\/admin\/communications\/personal'\)/);
});

test('personal inquiries support conversations, unread badges, audit, pagination, and rate limits', () => {
  assert.match(enhancementSetupSql, /create table if not exists public\.personal_inquiry_messages/i);
  assert.match(enhancementSetupSql, /create table if not exists public\.personal_inquiry_reads/i);
  assert.match(enhancementSetupSql, /create table if not exists public\.personal_inquiry_audit_logs/i);
  assert.match(enhancementSetupSql, /get_personal_inquiries_page_as_global_admin/);
  assert.match(enhancementSetupSql, /get_unread_personal_inquiry_count/);
  assert.match(enhancementSetupSql, /interval '60 seconds'/);
  assert.match(enhancementSetupSql, />= 3/);
  assert.match(service, /addPersonalInquiryMessage/);
  assert.match(service, /markPersonalInquiryRead/);
  assert.match(userPage, /personal_inquiry_messages/);
  assert.match(adminPage, /getPersonalInquiriesPageAsGlobalAdmin/);
  assert.match(adminPage, /markPersonalInquiryRead/);
  assert.match(service, /getPersonalInquiryAuditLogs/);
  assert.match(adminPage, /처리 이력/);
  assert.match(realtimeRlsSql, /user_id = auth\.uid\(\) or public\.is_global_admin\(\)/i);
  assert.match(realtimeRlsSql, /grant select on public\.personal_inquiry_messages to authenticated/i);
});
