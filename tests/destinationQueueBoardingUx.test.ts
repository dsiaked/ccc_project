import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const panel = readFileSync(
  'src/pages/admin/DestinationQueueBoardingPanel.tsx',
  'utf8'
);
const styles = readFileSync(
  'src/pages/admin/DestinationQueueBoardingPanel.module.css',
  'utf8'
);
const service = readFileSync(
  'src/lib/admin/boardingManagementService.ts',
  'utf8'
);
const boardingMigration = readFileSync(
  'supabase/migrations/20260614000005_219_destination_queue_boarding.sql',
  'utf8'
);
const departureMigration = readFileSync(
  'supabase/migrations/20260615000001_222_destination_queue_departure_snapshots.sql',
  'utf8'
);
const oneClickBoardingMigration = readFileSync(
  'supabase/migrations/20260615000004_225_preserve_explicit_boarding_status_on_ticket_change.sql',
  'utf8'
);
const waitingStatusMigration = readFileSync(
  'supabase/migrations/20260616000002_227_allow_destination_queue_waiting_status.sql',
  'utf8'
);

test('destination queue boarding prioritizes the current bus and departure safety', () => {
  assert.match(panel, /currentBusBoardedCount[\s\S]*BUS_CAPACITY[\s\S]*currentBusRemainingCount/);
  assert.match(panel, /마지막 버스 예상/);
  assert.match(panel, /role="dialog"[\s\S]*출발 처리/);
});

test('manager boarding assigns the bus and completes boarding in one click', () => {
  assert.match(panel, /버스 탑승을 먼저 시작해 주세요/);
  assert.match(
    departureMigration,
    /set confirmed_ticket = v_ticket,[\s\S]*boarding_status = 'boarded'/
  );
  assert.match(
    oneClickBoardingMigration,
    /old\.confirmed_ticket is distinct from new\.confirmed_ticket[\s\S]*allocationStrategy' = 'destination_queue'[\s\S]*old\.boarding_status = 'unchecked'[\s\S]*new\.boarding_status = 'boarded'[\s\S]*return new;[\s\S]*new\.boarding_status := 'unchecked'/
  );
  assert.match(panel, /pendingKeysRef\.current\.has\(key\)[\s\S]*pendingKeysRef\.current\.add\(key\)/);
});

test('destination queue boarding exposes mobile operational context and refresh status', () => {
  assert.match(panel, /자동 갱신 중 · 마지막 갱신/);
  assert.match(panel, /setStatusFilter\('unchecked'\)[\s\S]*setSearch\(''\)/);
  assert.match(styles, /\.control \{ position: sticky/);
  assert.match(panel, /현재 탑승 중인 명단[\s\S]*currentRosterPassengers/);
  assert.match(panel, /setCurrentRosterBusId\(currentBus\.id\)[\s\S]*탑승 명단/);
  assert.match(styles, /\.openBus \{ display: grid; grid-template-columns: auto minmax\(150px, 1fr\) auto auto auto/);
});

test('destination queue passengers can be returned to waiting from details and the current roster', () => {
  assert.match(service, /status: BoardingStatus/);
  assert.match(panel, /handleStatusChange\(selectedPassenger, 'unchecked'\)[\s\S]*대기/);
  assert.match(panel, /currentRosterWaitButton[\s\S]*handleStatusChange\(passenger, 'unchecked'\)/);
  assert.match(panel, /event\.note === 'destination_queue_manager_return_to_waiting'/);
  assert.match(waitingStatusMigration, /p_status not in \('unchecked', 'boarded', 'no_show'\)/);
  assert.match(waitingStatusMigration, /v_ticket := v_reservation\.confirmed_ticket - 'busId' - 'busNumber'/);
  assert.match(waitingStatusMigration, /v_bus\.status = 'full'[\s\S]*set status = 'open'/);
});

test('departed destination queue buses preserve and expose immutable rosters', () => {
  assert.match(boardingMigration, /idx_reservations_destination_queue_status_destination/);
  assert.match(boardingMigration, /idx_reservations_destination_queue_bus_boarded/);
  assert.match(departureMigration, /create table if not exists public\.destination_queue_departure_snapshots/);
  assert.match(departureMigration, /insert into public\.destination_queue_departure_snapshots[\s\S]*update public\.destination_queue_buses/);
  assert.match(departureMigration, /Departed bus passenger records are immutable/);
  assert.match(departureMigration, /get_destination_queue_departure_snapshots/);
  assert.match(service, /get_destination_queue_departure_snapshots/);
  assert.match(service, /isMissingDestinationQueueDepartureSnapshotRpc/);
  assert.match(panel, /출발 완료/);
  assert.match(panel, /명단 보기/);
  assert.match(panel, /CSV 다운로드/);
  assert.match(panel, /selectedPassengerBusDeparted[\s\S]*출발 완료 호차의 탑승 기록은 변경할 수 없습니다/);
});
