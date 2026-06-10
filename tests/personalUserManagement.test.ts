import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const setupSql = readFileSync(
  'sql/setup/147_personal_user_management.sql',
  'utf8'
);
const migrationSql = readFileSync(
  'supabase/migrations/20260610230010_149_personal_user_management.sql',
  'utf8'
);
const adminPage = readFileSync(
  'src/pages/admin/AdminPersonalTicketPage.tsx',
  'utf8'
);
const homePage = readFileSync('src/pages/HomePage.tsx', 'utf8');
const enhancementSetupSql = readFileSync(
  'sql/setup/151_personal_user_management_enhancements.sql',
  'utf8'
);
const enhancementMigrationSql = readFileSync(
  'supabase/migrations/20260610230012_151_personal_user_management_enhancements.sql',
  'utf8'
);
const notificationSection = readFileSync(
  'src/components/PersonalNotificationSection.tsx',
  'utf8'
);
const notificationService = readFileSync(
  'src/lib/personalNotificationService.ts',
  'utf8'
);
const notificationAuditSetupSql = readFileSync(
  'sql/setup/159_personal_notification_audit_reasons.sql',
  'utf8'
);
const notificationAuditMigrationSql = readFileSync(
  'supabase/migrations/20260610230023_159_personal_notification_audit_reasons.sql',
  'utf8'
);

test('personal user management setup SQL matches its migration', () => {
  assert.equal(migrationSql.replaceAll('\r\n', '\n'), setupSql.replaceAll('\r\n', '\n'));
});

test('personal user management enhancement setup SQL matches its migration', () => {
  assert.equal(
    enhancementMigrationSql.replaceAll('\r\n', '\n'),
    enhancementSetupSql.replaceAll('\r\n', '\n')
  );
});

test('personal user operations require reasons and global administrator RPCs', () => {
  assert.match(setupSql, /if not public\.is_global_admin\(\)/);
  assert.match(setupSql, /A reason is required/);
  assert.match(setupSql, /manage_personal_user_payment/);
  assert.match(setupSql, /record_personal_user_action/);
  assert.match(setupSql, /send_personal_notification/);
  assert.match(setupSql, /update_personal_user_info/);
});

test('personal user management exposes status, payment, notification, and history controls', () => {
  assert.match(adminPage, /개인 운영 상태/);
  assert.match(adminPage, /기본 정보 수정/);
  assert.match(adminPage, /입금 처리/);
  assert.match(adminPage, /개인 앱 알림/);
  assert.match(adminPage, /개인 작업 이력/);
  assert.match(homePage, /PersonalNotificationSection/);
});

test('personal user operations link atomic cancellation, payment reset, audit, and safe revert', () => {
  assert.match(enhancementSetupSql, /manage_personal_reservation_status/);
  assert.match(enhancementSetupSql, /manage_personal_reservation_status/);
  assert.match(enhancementSetupSql, /before_data jsonb/);
  assert.match(enhancementSetupSql, /after_data jsonb/);
  assert.match(enhancementSetupSql, /revert_personal_user_action/);
  assert.match(enhancementSetupSql, /update_personal_user_organization/);
  assert.match(enhancementSetupSql, /Another user already uses this phone number/);
});

test('personal user page exposes tabs, attention filter, templates, permissions, and bulk actions', () => {
  assert.match(adminPage, /요약·정보/);
  assert.match(adminPage, /조치 필요/);
  assert.match(adminPage, /알림 템플릿 선택/);
  assert.match(adminPage, /탑승 관리자 권한 부여/);
  assert.match(adminPage, /일괄 입금 확인/);
  assert.match(adminPage, /작업 되돌리기/);
  assert.match(adminPage, /위험 작업 확인/);
  assert.match(notificationSection, /개인 알림함/);
  assert.match(notificationSection, /markPersonalNotificationRead/);
});

test('personal notification center exposes failures and preserves partial read results', () => {
  assert.match(notificationService, /limit = 20/);
  assert.match(notificationSection, /supabase\.auth\.getSession/);
  assert.match(notificationSection, /if \(!loggedIn\) \{/);
  assert.match(notificationSection, /if \(isAuthLoading \|\| !isLoggedIn\) return null/);
  assert.match(notificationSection, /Promise\.allSettled/);
  assert.match(notificationSection, /readIds\.includes/);
  assert.match(notificationSection, /개인 알림을 불러오지 못했습니다/);
  assert.match(notificationSection, /role="alert"/);
  assert.match(notificationSection, /다시 시도/);
});

test('personal notification audit logs preserve the administrator reason', () => {
  assert.equal(
    notificationAuditMigrationSql.replaceAll('\r\n', '\n'),
    notificationAuditSetupSql.replaceAll('\r\n', '\n')
  );
  assert.match(notificationAuditSetupSql, /p_reason text default null/);
  assert.match(notificationAuditSetupSql, /coalesce\(nullif\(btrim\(p_reason\), ''\), btrim\(p_title\)\)/);
  assert.match(adminPage, /sendPersonalNotification\(\{[\s\S]*reason,/);
  assert.match(adminPage, /bulkSendPersonalNotifications\(\{[\s\S]*reason,/);
});
