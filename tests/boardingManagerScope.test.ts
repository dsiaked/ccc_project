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

test('boarding managers see assigned buses first and their selected roster before supporting overview sections', () => {
  const boardingStyles = readFileSync(
    'src/pages/admin/AdminBoardingPage.module.css',
    'utf8'
  );

  assert.match(
    boardingPage,
    /className=\{`\$\{styles\.boardingContent\} \$\{\s*!isGlobalAdmin \? styles\.boardingContentManager : ''\s*\}`\}/
  );
  assert.match(
    boardingStyles,
    /\.boardingContentManager \.roster\s*\{[^}]*order:\s*-1/i
  );
  assert.match(
    boardingStyles,
    /\.boardingContentManager \.busSelection\s*\{[^}]*order:\s*-2/i
  );
  assert.match(
    boardingPage,
    /<section className=\{styles\.busSelection\} aria-label=\{boardingScopeLabel\}>/
  );
});

test('selected bus tools share one workspace and use a compact boarding code control', () => {
  const boardingStyles = readFileSync(
    'src/pages/admin/AdminBoardingPage.module.css',
    'utf8'
  );

  assert.match(boardingPage, /<strong>탑승 코드<\/strong>/);
  assert.doesNotMatch(boardingPage, /버스에 탑승한 탑승자에게 이 4자리 코드를 안내하세요/);
  assert.match(boardingStyles, /\.roster\s*\{[^}]*background:\s*#f1f5f9/i);
  assert.match(boardingPage, /className=\{styles\.rosterHeading\}[\s\S]*?<\/div>\s*\{!isGlobalSearch && \(\s*<div className=\{styles\.checkInCodePanel\}/);
  assert.match(boardingStyles, /\.rosterHeader\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)\s*auto/i);
  assert.match(boardingStyles, /\.checkInCodePanel\s*\{[^}]*display:\s*flex/i);
  assert.match(boardingStyles, /\.checkInCodeValue\s*\{[^}]*font-size:\s*15px/i);
  assert.doesNotMatch(boardingStyles, /\.checkInCodeCopy\s*\{[^}]*display:\s*none/i);
  assert.doesNotMatch(boardingStyles, /\.checkInCodeActions span\s*\{[^}]*display:\s*none/i);
  assert.match(boardingStyles, /\.rosterHeading h2,\s*\.rosterHeading p\s*\{[^}]*word-break:\s*keep-all/i);
  assert.match(boardingStyles, /@media \(max-width:\s*760px\)[\s\S]*?\.checkInCodeActions span\s*\{[^}]*grid-row:\s*2/i);
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

test('global boarding search results identify each passenger bus', () => {
  assert.match(
    boardingPage,
    /\{isGlobalSearch && \(\s*<span className=\{styles\.passengerBus\}>\s*\{formatBusLabel\(passenger\.busNumber\)\}/
  );
});

test('boarding roster prioritizes statuses while newly boarded passengers stay in place', () => {
  assert.match(
    boardingPage,
    /const statusSortOrder: Record<BoardingStatus, number> = \{\s*unchecked: 0,\s*no_show: 1,\s*boarded: 2,\s*\}/
  );
  assert.match(
    boardingPage,
    /locallyBoardedPassengerIds\.has\(a\.reservationId\)[\s\S]*?statusSortOrder\.unchecked[\s\S]*?statusSortOrder\[a\.boardingStatus\]/
  );
  assert.match(
    boardingPage,
    /setLocallyBoardedPassengerIds\(new Set\(\)\)/
  );
  assert.match(
    boardingPage,
    /setBoardingFeedback\(`\$\{passenger\.name\}님 탑승 확인 완료`\)/
  );
});

test('boarding roster cards expose only the one-way boarding confirmation action', () => {
  const cardActionsStart = boardingPage.indexOf('<div className={styles.actions}>');
  const cardActionsEnd = boardingPage.indexOf('</div>', cardActionsStart);
  const cardActions = boardingPage.slice(cardActionsStart, cardActionsEnd);

  assert.ok(cardActionsStart > -1);
  assert.ok(cardActionsEnd > cardActionsStart);
  assert.match(cardActions, /onClick=\{\(\) => handleStatus\(passenger, 'boarded'\)\}/);
  assert.match(cardActions, /'탑승 확인됨'/);
  assert.match(cardActions, /'탑승 확인'/);
  assert.doesNotMatch(cardActions, /handleStatus\(passenger, 'no_show'\)/);
  assert.doesNotMatch(cardActions, /handleStatus\(passenger, 'unchecked'\)/);
  assert.doesNotMatch(cardActions, /type="checkbox"/);

  assert.match(
    boardingPage,
    /className=\{`\$\{styles\.noShowButton\}[\s\S]*?handleStatus\(selectedPassenger, 'no_show'\)/
  );
  assert.match(
    boardingPage,
    /className=\{`\$\{styles\.resetButton\}[\s\S]*?handleStatus\(selectedPassenger, 'unchecked'\)/
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

test('boarding manager bus cards are shown directly without bus-level filters', () => {
  assert.doesNotMatch(boardingPage, /const \[busSearch, setBusSearch\]/);
  assert.doesNotMatch(boardingPage, /const \[uncheckedBusesOnly, setUncheckedBusesOnly\]/);
  assert.doesNotMatch(boardingPage, /탑승 미확인 인원 남은 차량만/);
  assert.doesNotMatch(boardingPage, /조건에 맞는 차량이 없습니다/);
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
  const fieldExceptionActionsIndex = boardingPage.indexOf(
    '<div className={styles.fieldExceptionActions}>'
  );
  const departureFooterIndex = boardingPage.indexOf(
    '<div className={styles.departureFooter}>'
  );

  assert.ok(passengerListIndex > -1);
  assert.ok(fieldExceptionActionsIndex > passengerListIndex);
  assert.ok(departureFooterIndex > fieldExceptionActionsIndex);
  assert.ok(departureFooterIndex > passengerListIndex);
  assert.match(boardingPage, /모든 탑승 상태 확인 · 출발 완료/);
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
