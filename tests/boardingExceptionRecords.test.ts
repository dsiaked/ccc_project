import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const model = readFileSync(
  'src/pages/admin/boardingExceptionRecords.ts',
  'utf8'
);
const routes = readFileSync('src/routes/adminRoutes.tsx', 'utf8');
const header = readFileSync('src/pages/admin/AdminHeader.tsx', 'utf8');
const page = readFileSync(
  'src/pages/admin/AdminBoardingExceptionsPage.tsx',
  'utf8'
);
const archiveService = readFileSync(
  'src/lib/admin/boardingExceptionArchiveService.ts',
  'utf8'
);
const archiveSetup = readFileSync(
  'sql/setup/154_boarding_exception_archives.sql',
  'utf8'
);
const archiveMigration = readFileSync(
  'supabase/migrations/20260610230015_154_boarding_exception_archives.sql',
  'utf8'
);
const reasonEditSetup = readFileSync(
  'sql/setup/155_boarding_exception_reason_edits.sql',
  'utf8'
);
const reasonEditMigration = readFileSync(
  'supabase/migrations/20260610230019_155_boarding_exception_reason_edits.sql',
  'utf8'
);
const manualRecordSetup = readFileSync(
  'sql/setup/160_manual_boarding_exception_records.sql',
  'utf8'
);
const manualRecordMigration = readFileSync(
  'supabase/migrations/20260610230024_160_manual_boarding_exception_records.sql',
  'utf8'
);

test('special situation records combine the required field exception types', () => {
  assert.match(model, /passenger\.passengerKind !== 'walk_in'/);
  assert.match(model, /event\.note === 'boarding_bus_moved'/);
  assert.match(model, /event\.toStatus === 'no_show'/);
  assert.match(
    model,
    /event\.fromStatus === 'no_show'[\s\S]*event\.toStatus === 'boarded'/
  );
  assert.match(model, /bus_departed_auto_no_show/);
  assert.match(model, /passengersWithNoShowEvents/);
  assert.match(model, /passenger\.boardingStatus !== 'no_show'/);
  assert.match(model, /return records\.sort/);
});

test('special situation records page is available to boarding roles', () => {
  assert.match(routes, /path: 'boarding\/exceptions'/);
  assert.match(
    routes,
    /path: 'boarding\/exceptions',[\s\S]*AdminBoardingExceptionsPage[\s\S]*boardingAccess/
  );
  assert.match(header, /label: '특수상황 기록'/);
  assert.match(page, /해결되지 않은 현장 예외를 우선 확인/);
  assert.match(page, /boarding_walk_in_passengers/);
  assert.match(page, /boarding_status_events/);
});

test('the main special situation view shows only unresolved records', () => {
  assert.match(page, /const \[view, setView\].*'unresolved'/);
  assert.match(
    page,
    /records\.filter\(\(record\) => !archivedKeys\.has\(record\.id\)\)/
  );
  assert.match(page, /view === 'archived' \? archivedRecords : unresolvedRecords/);
  assert.match(page, /미해결/);
  assert.match(page, /보관함/);
});

test('only global administrators can archive or restore special situations', () => {
  assert.equal(archiveSetup, archiveMigration);
  assert.match(
    archiveMigration,
    /create table if not exists public\.boarding_exception_archives/i
  );
  assert.match(
    archiveMigration,
    /not public\.is_global_admin\(\)[\s\S]*Only global administrators can archive boarding exceptions/i
  );
  assert.match(
    archiveMigration,
    /not public\.is_global_admin\(\)[\s\S]*Only global administrators can restore boarding exceptions/i
  );
  assert.match(page, /isGlobalAdmin && view === 'unresolved'/);
  assert.match(page, /확인 후 보관/);
  assert.match(page, /미해결로 복구/);
  assert.match(archiveService, /archive_boarding_exception_as_global_admin/);
  assert.match(archiveService, /restore_boarding_exception_as_global_admin/);
});

test('boarding managers only receive and edit reasons for assigned buses', () => {
  assert.equal(reasonEditSetup, reasonEditMigration);
  assert.match(model, /busId: passenger\.busId \?\? ''/);
  assert.match(
    reasonEditMigration,
    /where public\.can_manage_boarding_bus\(edit\.allocation_id, edit\.bus_id\)/i
  );
  assert.match(
    reasonEditMigration,
    /if not public\.can_manage_boarding_bus\(p_allocation_id, p_bus_id\)[\s\S]*You are not assigned to this bus/i
  );
  assert.match(
    reasonEditMigration,
    /The boarding exception record does not belong to this bus/i
  );
  assert.match(
    reasonEditMigration,
    /create table if not exists public\.boarding_exception_reason_edit_logs/i
  );
  assert.match(
    reasonEditMigration,
    /archive\.record_data ->> 'busId'/i
  );
  assert.match(page, /updateBoardingExceptionReason/);
  assert.match(page, /처리 사유 수정/);
  assert.match(archiveService, /get_boarding_exception_reason_edit_snapshot/);
  assert.match(archiveService, /update_boarding_exception_reason/);
});

test('boarding managers can create manual records only for their assigned buses', () => {
  assert.equal(manualRecordSetup, manualRecordMigration);
  assert.match(
    manualRecordMigration,
    /create table if not exists public\.manual_boarding_exception_records/i
  );
  assert.match(
    manualRecordMigration,
    /where public\.can_manage_boarding_bus\(record\.allocation_id, record\.bus_id\)/i
  );
  assert.match(
    manualRecordMigration,
    /if not public\.can_manage_boarding_bus\(p_allocation_id, p_bus_id\)[\s\S]*You are not assigned to this bus/i
  );
  assert.match(
    manualRecordMigration,
    /The selected passenger does not belong to this bus/i
  );
  assert.match(manualRecordMigration, /p_record_key like p_allocation_id::text \|\| ':manual:%'/i);
  assert.match(page, /createManualBoardingExceptionRecord/);
  assert.match(page, /새 기록 추가/);
  assert.match(page, /관련 탑승자 \(선택\)/);
  assert.match(archiveService, /get_manual_boarding_exception_records/);
  assert.match(archiveService, /create_manual_boarding_exception_record/);
});
