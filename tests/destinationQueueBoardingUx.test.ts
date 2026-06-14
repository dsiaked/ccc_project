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

test('destination queue boarding prioritizes the current bus and departure safety', () => {
  assert.match(panel, /currentBusBoardedCount[\s\S]*BUS_CAPACITY[\s\S]*currentBusRemainingCount/);
  assert.match(panel, /마지막 버스 예상/);
  assert.match(panel, /role="dialog"[\s\S]*출발 처리/);
});

test('destination queue boarding keeps bus creation explicit and actions independently locked', () => {
  assert.doesNotMatch(panel, /err\.message\.includes\('No open bus exists'\)/);
  assert.match(panel, /버스 탑승을 먼저 시작해 주세요/);
  assert.match(panel, /pendingKeysRef\.current\.has\(key\)[\s\S]*pendingKeysRef\.current\.add\(key\)/);
  assert.match(boardingMigration, /status = 'full'[\s\S]*Depart the full bus before starting the next bus/);
});

test('destination queue boarding exposes mobile operational context and refresh status', () => {
  assert.match(panel, /자동 갱신 중 · 마지막 갱신/);
  assert.match(panel, /setStatusFilter\('unchecked'\)[\s\S]*setSearch\(''\)/);
  assert.match(styles, /\.control \{ position: sticky/);
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
