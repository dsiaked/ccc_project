import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const setupSql = readFileSync(
  'sql/setup/147_personal_user_management.sql',
  'utf8'
);
const migrationSql = readFileSync(
  'sql/setup/147_personal_user_management.sql',
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
  'sql/setup/151_personal_user_management_enhancements.sql',
  'utf8'
);
const notificationSection = readFileSync(
  'src/components/HomeNoticeSection.tsx',
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
  'sql/setup/159_personal_notification_audit_reasons.sql',
  'utf8'
);
const adminReservationSetupSql = readFileSync(
  'sql/setup/205_admin_save_personal_reservation.sql',
  'utf8'
);
const adminReservationMigrationSql = readFileSync(
  'supabase/migrations/20260613000002_205_admin_save_personal_reservation.sql',
  'utf8'
);
const externalReservationSetupSql = readFileSync(
  'sql/setup/206_allow_external_organization_update.sql',
  'utf8'
);
const externalReservationMigrationSql = readFileSync(
  'supabase/migrations/20260613000003_206_allow_external_organization_update.sql',
  'utf8'
);
const profileAffiliationMigrationSql = readFileSync(
  'supabase/migrations/20260626000002_236_personal_user_profile_affiliation.sql',
  'utf8'
);
const personalTicketService = readFileSync(
  'src/lib/admin/personalTicketService.ts',
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
  assert.doesNotMatch(homePage, /PersonalNotificationSection/);
  assert.match(homePage, /HomeNoticeSection/);
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
  assert.match(notificationSection, /개인 알림/);
  assert.match(notificationSection, /markPersonalNotificationRead/);
});

test('notice list exposes personal notification failures and read state', () => {
  assert.match(notificationService, /limit = 20/);
  assert.match(notificationSection, /supabase\.auth\.getSession/);
  assert.match(notificationSection, /Promise\.allSettled/);
  assert.match(notificationSection, /personalTag/);
  assert.match(notificationSection, /읽음 처리하지 못했습니다/);
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

test('admin reservation save SQL stays aligned across setup and migrations', () => {
  assert.equal(
    adminReservationMigrationSql.replaceAll('\r\n', '\n'),
    adminReservationSetupSql.replaceAll('\r\n', '\n')
  );
  assert.equal(
    externalReservationMigrationSql.replaceAll('\r\n', '\n'),
    externalReservationSetupSql.replaceAll('\r\n', '\n')
  );
});

test('admin reservation save supports explicit external affiliation', () => {
  assert.match(
    adminReservationSetupSql,
    /case when p_data ->> 'affiliationType' = 'external' then 'external' else 'seoul' end/
  );
  assert.match(
    adminReservationSetupSql,
    /case when v_affiliation_type = 'external' then '' else trim\(p_team\) end/
  );
  assert.match(externalReservationSetupSql, /coordinatorName/);
  assert.match(externalReservationSetupSql, /coordinatorPhone/);
});

test('personal user affiliation saves independently from bus reservations', () => {
  assert.match(profileAffiliationMigrationSql, /profile\.affiliation_type/i);
  assert.match(profileAffiliationMigrationSql, /profile\.coordinator_name/i);
  assert.match(profileAffiliationMigrationSql, /'affiliation_type', row\.affiliation_type/i);
  assert.match(personalTicketService, /affiliationType:/);
  assert.match(personalTicketService, /coordinatorName:/);
  assert.match(adminPage, /getReservationAffiliationType\(selectedReservation\)/);
  assert.match(adminPage, /selectedReservation\.coordinatorName/);
  assert.doesNotMatch(
    adminPage,
    /const isExternal = selectedReservation\.rawData\?\.affiliationType === 'external'/
  );
});

test('personal user page exposes retryable station loading and copyable account fields', () => {
  assert.match(adminPage, /Promise\.allSettled/);
  assert.match(adminPage, /stationLoadError/);
  assert.match(adminPage, /allocationLoadError/);
  assert.match(adminPage, /navigator\.clipboard\.writeText/);
  assert.match(adminPage, /readOnly/);
  assert.match(adminPage, /handleCopyAccountField/);
});
