import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const boardingPage = readFileSync('src/pages/admin/AdminBoardingPage.tsx', 'utf8');
const latestBoardingSnapshotMigration = readFileSync(
  'supabase/migrations/20260609180001_111_classify_automatic_boarding_events.sql',
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

test('boarding roster renders passengers as compact seat cards', () => {
  const boardingStyles = readFileSync(
    'src/pages/admin/AdminBoardingPage.module.css',
    'utf8'
  );

  assert.match(boardingPage, /className=\{styles\.passengerSeat\}/);
  assert.match(boardingPage, /className=\{styles\.passengerName\}/);
  assert.match(boardingPage, /className=\{styles\.passengerDetails\}/);
  assert.match(
    boardingStyles,
    /\.passengerList\s*\{[^}]*grid-template-columns:\s*repeat\(4,/i
  );
});
