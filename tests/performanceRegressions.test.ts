import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const readSource = (path: string) => readFileSync(path, 'utf8');

test('global notice targets are loaded in one batched query', () => {
  const source = readSource('src/lib/adminService.ts');
  const getGlobalNotices = source.slice(
    source.indexOf('export async function getGlobalCampusNotices'),
    source.indexOf('async function createLegacyGlobalCampusNotice')
  );

  assert.match(getGlobalNotices, /getCampusNoticeTargets\(\s*rows\.map/);
  assert.doesNotMatch(getGlobalNotices, /getCampusNoticeTargets\(\[row\.id\]\)/);
});

test('campus request summary uses one aggregate RPC', () => {
  const source = readSource('src/lib/adminService.ts');
  const getSummary = source.slice(
    source.indexOf('export async function getCampusRequestSummary'),
    source.indexOf('export async function getUnreadCampusRequestIds')
  );

  assert.match(getSummary, /supabase\.rpc\('get_campus_request_summary'\)/);
  assert.doesNotMatch(getSummary, /Promise\.all|countRequests|countNotices/);
});

test('campus request realtime refreshes are coalesced', () => {
  const board = readSource('src/pages/admin/AdminCampusRequestsPage.tsx');
  const header = readSource('src/pages/admin/AdminHeader.tsx');

  assert.match(board, /const scheduleRealtimeSync = \(includeSummary: boolean\)/);
  assert.match(header, /const scheduleBadgeRefresh = \(\)/);
});

test('administrator header reuses provider roles and parallelizes badge requests', () => {
  const provider = readSource('src/components/AdminAuthProvider.tsx');
  const header = readSource('src/pages/admin/AdminHeader.tsx');

  assert.match(provider, /adminRoles: AdminRole\[\]/);
  assert.match(header, /adminRoles\.filter\(\(item\) => item\.role !== 'global_admin'\)/);
  assert.doesNotMatch(header, /clearAdminRoleCache|const roles = await getAdminRoles/);
  assert.match(
    header,
    /const refreshBadge = async \(\) => \{[\s\S]*Promise\.all\(\[[\s\S]*getUnreadCampusRequestIds\(\)[\s\S]*getUnreadPersonalInquiryCount\(\)/
  );
});

test('home deadline and reservation requests avoid duplicate waterfalls', () => {
  const deadlineService = readSource('src/lib/reservationDeadlineService.ts');
  const reservationService = readSource('src/lib/reservationService.ts');
  const hero = readSource('src/components/HeroSection.tsx');

  assert.match(deadlineService, /reservationDeadlineRequest/);
  assert.match(reservationService, /getReservationForUser/);
  assert.match(hero, /Promise\.all\(\[[\s\S]*getReservationDeadline\(\)[\s\S]*getReservationForUser/);
});

test('home notice realtime events refresh only their affected data', () => {
  const notices = readSource('src/components/HomeNoticeSection.tsx');

  assert.match(notices, /const refreshPersonalNotifications = async/);
  assert.match(notices, /const refreshCampusNotices = async/);
  assert.doesNotMatch(
    notices,
    /table: 'personal_notifications'[\s\S]{0,180}\(\) => void loadNotices\(\)/
  );
  assert.doesNotMatch(
    notices,
    /table: 'campus_requests'[\s\S]{0,180}\(\) => void loadNotices\(\)/
  );
});

test('allocation result parallelizes independent initial queries', () => {
  const resultPage = readSource('src/pages/admin/AdminAllocationResultPage.tsx');

  assert.match(resultPage, /\.or\('status\.neq\.cancelled,status\.is\.null'\)/);
  assert.match(
    resultPage,
    /const \[latestAllocation, reservationRows, profileResult\] = await Promise\.all/
  );
});

test('boarding passenger cards defer offscreen rendering', () => {
  const styles = readSource('src/pages/admin/AdminBoardingPage.module.css');

  assert.match(styles, /\.passenger \{[^}]*content-visibility: auto;/);
  assert.match(styles, /\.passenger \{[^}]*contain-intrinsic-size:/);
});

test('campus request realtime subscription stays connected while editing', () => {
  const board = readSource('src/pages/admin/AdminCampusRequestsPage.tsx');
  const realtimeEffect = board.slice(
    board.indexOf('const refreshRealtimeBoard = useEffectEvent'),
    board.indexOf('const selectedNoticeTargets = useMemo')
  );

  assert.match(realtimeEffect, /isRealtimeBoardSyncBlocked = useEffectEvent/);
  assert.match(realtimeEffect, /\}, \[adminRole\]\);/);
  assert.doesNotMatch(
    board,
    /\}, \[\s*adminRole,\s*editingMessageId,\s*hasUnsavedBoardDrafts,\s*processingId,\s*submitting,\s*\]\);/
  );
});

test('optimizer validation indexes seats by bus instead of rescanning assignments', () => {
  const source = readSource('optimizer/exact_optimizer/validation.py');

  assert.match(source, /seats_by_bus\.setdefault\(assignment\.bus_id/);
  assert.doesNotMatch(source, /if assignment\.bus_id == bus\.bus_id/);
});

test('detailed optimizer indexes assignment variables by slot', () => {
  const source = readSource('optimizer/exact_optimizer/model.py');

  assert.match(source, /assignment_variables_by_slot\[slot\.key\]\.append\(variable\)/);
  assert.match(source, /_sum\(assignment_variables_by_slot\[slot\.key\]\)/);
});

test('Kakao SDK timeout removes stale script handlers and element', () => {
  const source = readSource('src/utils/kakaoMapSdk.ts');

  assert.match(source, /rejectWithCleanup\(new Error\('Kakao Maps SDK loading timed out\.'\)\)/);
  assert.match(source, /script\.onload = null/);
  assert.match(source, /script\.onerror = null/);
  assert.match(source, /script\.remove\(\)/);
});

test('message search and optimizer result reuse have supporting indexes', () => {
  const migration = readSource(
    'supabase/migrations/20260610150001_132_performance_lookup_indexes.sql'
  );

  assert.match(
    migration,
    /idx_campus_request_messages_message_trgm[\s\S]*message extensions\.gin_trgm_ops/i
  );
  assert.match(
    migration,
    /idx_allocation_optimization_jobs_optimal_reuse[\s\S]*optimization_scope,[\s\S]*input_hash,[\s\S]*completed_at desc[\s\S]*where status = 'OPTIMAL'/i
  );
  assert.match(
    migration,
    /function public\.get_reusable_allocation_optimization_job[\s\S]*reusable\.input_snapshot = p_input_snapshot/i
  );
  assert.match(
    migration,
    /function public\.get_campus_request_summary\(\)[\s\S]*count\(\*\) filter/i
  );
});

test('optimizer worker throttles status polling and heartbeats', () => {
  const source = readSource('optimizer/exact_optimizer/worker.py');

  assert.match(source, /rpc\/get_reusable_allocation_optimization_job/);
  assert.doesNotMatch(source, /"&limit=20"/);
  assert.match(source, /STATUS_POLL_INTERVAL_SECONDS = 2\.0/);
  assert.match(source, /HEARTBEAT_INTERVAL_SECONDS = 5\.0/);
  assert.match(
    source,
    /elapsed - last_status_check >= STATUS_POLL_INTERVAL_SECONDS/
  );
});
