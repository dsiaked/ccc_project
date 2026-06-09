import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const boardingPage = readFileSync('src/pages/admin/AdminBoardingPage.tsx', 'utf8');
const latestBoardingSnapshotMigration = readFileSync(
  'supabase/migrations/20260610230013_152_fix_boarding_station_preferences.sql',
  'utf8'
);

test('boarding manager page describes and searches only the assigned bus scope', () => {
  assert.match(
    boardingPage,
    /const boardingScopeLabel = isGlobalAdmin \? '전체 확정 호차' : '내 담당 호차'/
  );
  assert.match(boardingPage, /배정받은 담당 호차만 표시됩니다/);
  assert.match(
    boardingPage,
    /placeholder=\{`\$\{boardingScopeLabel\}에서 이름, 연락처, 소속, 호차 검색`\}/
  );
});

test('boarding overview shows departed buses over the role-scoped bus total', () => {
  assert.match(
    boardingPage,
    /const departedBusCount = \(snapshot\?\.buses \?\? \[\]\)\.filter\(\s*\(bus\) => Boolean\(bus\.departedAt\)\s*\)\.length/
  );
  assert.match(
    boardingPage,
    /\{isGlobalAdmin \? '출발 차량 \/ 운영 차량' : '출발 차량 \/ 담당 호차'\}/
  );
  assert.match(
    boardingPage,
    /\{departedBusCount\.toLocaleString\(\)\}\/\{snapshot\.buses\.length\.toLocaleString\(\)\}대/
  );
});

test('full roster exports and sheet access remain global-admin only', () => {
  assert.match(
    boardingPage,
    /\{isGlobalAdmin && \(\s*<div className=\{styles\.exportActions\}>[\s\S]*?조회용 Google Sheet[\s\S]*?<\/div>\s*\)\}/
  );
});

test('latest boarding snapshot limits buses and passengers through assignment checks', () => {
  assert.match(
    latestBoardingSnapshotMigration,
    /where public\.can_manage_boarding_bus\(v_allocation\.id, bus ->> 'id'\)/i
  );
  assert.match(
    latestBoardingSnapshotMigration,
    /and public\.can_manage_boarding_reservation\(reservation\.id\)/i
  );
});

test('boarding roster renders passengers as compact cards without roster numbers', () => {
  const boardingStyles = readFileSync(
    'src/pages/admin/AdminBoardingPage.module.css',
    'utf8'
  );

  assert.doesNotMatch(boardingPage, /className=\{styles\.passengerSeat\}/);
  assert.doesNotMatch(boardingStyles, /\.passengerSeat/);
  assert.match(boardingPage, /className=\{styles\.passengerName\}/);
  assert.match(boardingPage, /className=\{styles\.detailButton\}/);
  assert.match(
    boardingStyles,
    /\.passengerList\s*\{[^}]*grid-template-columns:\s*repeat\(4,/i
  );
  assert.match(
    boardingPage,
    /a\.seatNumber\.localeCompare\(b\.seatNumber, 'ko', \{ numeric: true \}\)/
  );
});

test('boarding passenger details open in a dedicated accessible panel', () => {
  const boardingStyles = readFileSync(
    'src/pages/admin/AdminBoardingPage.module.css',
    'utf8'
  );

  assert.match(boardingPage, /role="dialog"/);
  assert.match(boardingPage, /aria-modal="true"/);
  assert.match(boardingPage, /selectedPassenger\.district/);
  assert.match(boardingPage, /selectedPassenger\.team/);
  assert.match(boardingPage, /selectedPassenger\.boardingNoteUpdatedByName/);
  assert.match(boardingPage, /전달사항을 저장했습니다\./);
  assert.match(
    boardingStyles,
    /\.detailPanel\s*\{[^}]*width:\s*min\(100%,\s*520px\)/i
  );
  assert.match(
    boardingStyles,
    /@media \(max-width: 560px\)[\s\S]*?\.detailPanel\s*\{[^}]*height:\s*min\(88vh,\s*760px\)/i
  );
});

test('mobile back closes passenger details without leaving boarding management', () => {
  assert.match(
    boardingPage,
    /window\.history\.pushState\([\s\S]*boardingPassengerDetail/
  );
  assert.match(boardingPage, /window\.addEventListener\('popstate', handlePopState\)/);
  assert.match(
    boardingPage,
    /const closePassengerDetails = \(\) => \{[\s\S]*window\.history\.back\(\)/
  );
  assert.match(
    boardingPage,
    /const handlePopState = \(\) => \{[\s\S]*setSelectedPassengerId\(''\)/
  );
});

test('manual no-show processing opens passenger details and requires a newly written reason', () => {
  assert.match(
    boardingPage,
    /if \(status === 'no_show' && !noShowReasonSaved\) \{[\s\S]*?setSelectedPassengerId\(passenger\.reservationId\);[\s\S]*?setNoShowReasonPassengerId\(passenger\.reservationId\);[\s\S]*?return;/
  );
  assert.match(boardingPage, /미탑승 사유 \(필수\)/);
  assert.match(boardingPage, /required=\{isWritingNoShowReason\}/);
  assert.match(
    boardingPage,
    /isWritingNoShowReason\s*&&\s*isSelectedPassengerNoteChanged\s*&&\s*Boolean\(selectedPassengerNoteDraft\.trim\(\)\)/
  );
  assert.match(boardingPage, /사유 저장 · 미탑승 처리/);
  assert.match(boardingPage, /'no_show',\s*true,\s*note/);
  assert.match(
    boardingPage,
    /const selectedPassengerActionStatus: BoardingStatus = isWritingNoShowReason[\s\S]*\? 'no_show'/
  );
  assert.match(boardingPage, /aria-pressed=\{selectedPassengerActionStatus === 'no_show'\}/);
  assert.doesNotMatch(
    boardingPage,
    /boardingStatus === 'no_show' \|\| !passengerBus\?\.departedAt/
  );
  assert.doesNotMatch(
    boardingPage,
    /boardingStatus === 'no_show' \|\| !selectedPassengerBus\?\.departedAt/
  );
});

test('boarding bus attention filter shows buses with unchecked passengers remaining', () => {
  assert.match(
    boardingPage,
    /if \(uncheckedBusesOnly && !counts\?\.unchecked\) return false/
  );
  assert.match(boardingPage, /탑승 미확인 인원 남은 차량만/);
  assert.doesNotMatch(boardingPage, /미탑승 발생 차량만/);
});

test('departed buses with unchecked passengers show a separate orange warning', () => {
  const boardingStyles = readFileSync(
    'src/pages/admin/AdminBoardingPage.module.css',
    'utf8'
  );

  assert.match(
    boardingPage,
    /const hasDepartedWithUnchecked =\s*Boolean\(bus\.departedAt\) && counts\.unchecked > 0/
  );
  assert.match(boardingPage, /출발 후 미확인 \{counts\.unchecked\}명/);
  assert.match(boardingPage, /styles\.busCardDepartureWarning/);
  assert.match(boardingStyles, /\.busCardDepartureWarning\s*\{[^}]*#f97316/i);
  assert.match(boardingStyles, /\.departedUncheckedBadge\s*\{[^}]*#ffedd5/i);
});

test('boarding departure action appears after the passenger list', () => {
  const passengerListIndex = boardingPage.indexOf(
    '<div className={styles.passengerList}>'
  );
  const departureFooterIndex = boardingPage.indexOf(
    '<div className={styles.departureFooter}>'
  );

  assert.ok(passengerListIndex > -1);
  assert.ok(departureFooterIndex > passengerListIndex);
  assert.match(boardingPage, /남은 미확인 전원 미탑승 처리 · 출발 완료/);
});

test('boarding passenger details show first and second destination preferences', () => {
  assert.match(
    latestBoardingSnapshotMigration,
    /jsonb_typeof\(reservation\.station_preferences\) = 'array'[\s\S]*?reservation\.data -> 'stationPreferences'/i
  );
  assert.match(
    latestBoardingSnapshotMigration,
    /'assignedDestination', coalesce\([\s\S]*?reservation\.confirmed_ticket ->> 'dropoffStation'[\s\S]*?bus ->> 'destination'/i
  );
  assert.match(boardingPage, /귀가역 지망 정보/);
  assert.match(boardingPage, /\{\[0, 1\]\.map/);
  assert.match(boardingPage, /실제 배정 ·/);
  assert.match(boardingPage, /현장 추가 탑승자는 신청 지망 정보가 없습니다/);
});

test('boarding passenger details omit the roster number', () => {
  const detailStart = boardingPage.indexOf('<dl className={styles.detailFacts}>');
  const detailEnd = boardingPage.indexOf('</dl>', detailStart);
  const detailFacts = boardingPage.slice(detailStart, detailEnd);

  assert.ok(detailStart > -1);
  assert.ok(detailEnd > detailStart);
  assert.doesNotMatch(detailFacts, /명단 번호/);
  assert.doesNotMatch(detailFacts, /selectedPassenger\.seatNumber/);
});
