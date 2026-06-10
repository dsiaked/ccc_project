import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const page = readFileSync('src/pages/ReservationPage.tsx', 'utf8');

test('reservation deletion uses a scoped safety modal', () => {
  assert.match(page, /setIsDeleteConfirmModalOpen\(true\)/);
  assert.match(page, /role="dialog"/);
  assert.match(page, /버스 신청 영구 삭제/);
  assert.match(page, /신청자 정보와 희망 행선지, 연결된 결제 기록이 제거되고 향후[\s\S]*배차 대상에서 제외됩니다/);
  assert.match(page, /삭제한 신청은 복구할 수 없습니다/);
  assert.match(page, /신청을 삭제하면 연결된 입금 상태도 함께 제거됩니다/);
  assert.match(page, /신청 · 결제 기록 삭제, 배차 대상 제외/);
  assert.match(page, /className=\{styles\.deleteConfirmCancel\}[\s\S]*autoFocus/);
  assert.doesNotMatch(page, /window\.confirm/);
});

test('reservation deletion blocks duplicate execution and keeps failures visible', () => {
  assert.match(page, /const reservationDeletionInFlightRef = useRef\(false\)/);
  assert.match(
    page,
    /reservationDeletionInFlightRef\.current = true[\s\S]*await deleteReservation\(\)[\s\S]*reservationDeletionInFlightRef\.current = false/
  );
  assert.match(page, /setReservationDeleteError\([\s\S]*신청 삭제에 실패했습니다/);
  assert.match(page, /className=\{styles\.deleteConfirmError\} role="alert"/);
  assert.match(page, /onClick=\{\(\) => void confirmCancelReservation\(\)\}/);
});
