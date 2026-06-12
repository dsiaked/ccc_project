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
const deleteInquirySetupSql = readFileSync(
  'sql/setup/201_global_admin_delete_inquiries.sql',
  'utf8'
);
const deleteInquiryMigrationSql = readFileSync(
  'supabase/migrations/20260612000006_201_global_admin_delete_inquiries.sql',
  'utf8'
);
const adminService = readFileSync('src/lib/adminService.ts', 'utf8');
const service = readFileSync('src/lib/personalInquiryService.ts', 'utf8');
const userPage = readFileSync('src/pages/PersonalInquiryPage.tsx', 'utf8');
const adminPage = readFileSync(
  'src/pages/admin/AdminPersonalInquiriesPage.tsx',
  'utf8'
);
const unifiedAdminPage = readFileSync(
  'src/pages/admin/AdminUnifiedInquiriesPage.tsx',
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

test('global admin inquiry deletion setup matches its migration', () => {
  assert.equal(
    deleteInquiryMigrationSql.replaceAll('\r\n', '\n'),
    deleteInquirySetupSql.replaceAll('\r\n', '\n')
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
  assert.match(unifiedAdminPage, /개인 사용자와 캠퍼스 관리자의 문의를 한곳에서 처리합니다/);
  assert.match(unifiedAdminPage, /respondToPersonalInquiry/);
  assert.match(unifiedAdminPage, /updateCampusRequestStatus/);
  assert.match(unifiedAdminPage, /답변 및 상태 저장/);
  assert.match(adminRoutes, /path: 'communications\/personal'/);
  assert.match(adminRoutes, /source=personal/);
  assert.doesNotMatch(communications, /navigate\('\/admin\/communications\/personal'\)/);
});

test('personal inquiry management remains available while the enhanced RPC is pending', () => {
  assert.match(service, /isMissingPersonalInquiryPageRpc/u);
  assert.match(service, /getLegacyCompatiblePersonalInquiryPage/u);
  assert.match(service, /get_personal_inquiries_as_global_admin/u);
  assert.match(service, /getLegacyPersonalInquiryMessages/u);
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
  assert.match(unifiedAdminPage, /getPersonalInquiriesPageAsGlobalAdmin/);
  assert.match(unifiedAdminPage, /markPersonalInquiryRead/);
  assert.match(service, /getPersonalInquiryAuditLogs/);
  assert.match(adminPage, /처리 이력/);
  assert.match(realtimeRlsSql, /user_id = auth\.uid\(\) or public\.is_global_admin\(\)/i);
  assert.match(realtimeRlsSql, /grant select on public\.personal_inquiry_messages to authenticated/i);
});

test('global administrators use one inbox for campus and personal inquiries', () => {
  assert.match(adminRoutes, /path: 'communications',[\s\S]*?<AdminUnifiedInquiriesPage/);
  assert.match(adminRoutes, /path: 'communications\/notices'/);
  assert.match(unifiedAdminPage, /getCampusRequestsPage/);
  assert.match(unifiedAdminPage, /getPersonalInquiriesPageAsGlobalAdmin/);
  assert.match(unifiedAdminPage, /sourceLabel: '캠퍼스 문의'/);
  assert.match(unifiedAdminPage, /sourceLabel: '개인 문의'/);
  assert.match(unifiedAdminPage, /admin-unified-inquiries/);
  assert.match(unifiedAdminPage, /loadPersonalStatusItems/);
});

test('global administrators can permanently delete inquiries from the unified inbox', () => {
  assert.match(
    deleteInquirySetupSql,
    /delete_campus_request_as_global_admin[\s\S]*not public\.is_global_admin\(\)/i
  );
  assert.match(
    deleteInquirySetupSql,
    /delete from public\.campus_requests[\s\S]*is_global_notice = false/i
  );
  assert.match(
    deleteInquirySetupSql,
    /delete_personal_inquiry_as_global_admin[\s\S]*delete from public\.personal_inquiries/i
  );
  assert.match(adminService, /deleteCampusRequestAsGlobalAdmin/);
  assert.match(service, /deletePersonalInquiryAsGlobalAdmin/);
  assert.match(unifiedAdminPage, /deleteCampusRequestAsGlobalAdmin/);
  assert.match(unifiedAdminPage, /deletePersonalInquiryAsGlobalAdmin/);
  assert.match(unifiedAdminPage, /window\.confirm/);
  assert.match(unifiedAdminPage, /문의 삭제/);
});

test('unified inquiry read receipts do not block the inbox from rendering', () => {
  assert.match(
    unifiedAdminPage,
    /void Promise\.allSettled\([\s\S]*?markPersonalInquiryRead[\s\S]*?markCampusRequestRead/
  );
  assert.doesNotMatch(
    unifiedAdminPage,
    /await Promise\.allSettled\([\s\S]*?markPersonalInquiryRead[\s\S]*?markCampusRequestRead/
  );
});

test('unified inquiry inbox tolerates missing or invalid legacy dates', () => {
  assert.match(unifiedAdminPage, /if \(!value\) return '-'/);
  assert.match(unifiedAdminPage, /Number\.isFinite\(date\.getTime\(\)\)/);
});
