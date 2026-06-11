import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const page = readFileSync('src/pages/ReservationPage.tsx', 'utf8');

test('reservation deletion uses a scoped safety modal', () => {
  assert.match(page, /setIsDeleteConfirmModalOpen\(true\)/);
  assert.match(page, /role="dialog"/);
  assert.match(page, /踰꾩뒪 ?좎껌 ?곴뎄 ??젣/);
  assert.match(page, /?좎껌???뺣낫? ?щ쭩 ?됱꽑吏, ?곌껐??寃곗젣 湲곕줉???쒓굅?섍퀬 ?ν썑[\s\S]*諛곗감 ??곸뿉???쒖쇅?⑸땲??/);
  assert.match(page, /??젣???좎껌? 蹂듦뎄?????놁뒿?덈떎/);
  assert.match(page, /?좎껌 쨌 寃곗젣 湲곕줉 ??젣, 諛곗감 ????쒖쇅/);
  assert.match(page, /className=\{styles\.deleteConfirmCancel\}[\s\S]*autoFocus/);
  assert.doesNotMatch(page, /window\.confirm/);
});

test('reservation deletion blocks duplicate execution and keeps failures visible', () => {
  assert.match(page, /const reservationDeletionInFlightRef = useRef\(false\)/);
  assert.match(
    page,
    /reservationDeletionInFlightRef\.current = true[\s\S]*await deleteReservation\(\)[\s\S]*reservationDeletionInFlightRef\.current = false/
  );
  assert.match(page, /setReservationDeleteError\([\s\S]*?좎껌 ??젣???ㅽ뙣?덉뒿?덈떎/);
  assert.match(page, /className=\{styles\.deleteConfirmError\} role="alert"/);
  assert.match(page, /onClick=\{\(\) => void confirmCancelReservation\(\)\}/);
});
