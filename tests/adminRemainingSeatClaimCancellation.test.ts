import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const page = readFileSync(
  'src/pages/admin/AdminRemainingSeatSalesPage.tsx',
  'utf8'
);

test('remaining seat payment confirmation reviews the deposit and issued ticket', () => {
  assert.match(page, /setPendingPaymentConfirmation\(item\)/);
  assert.match(page, /실제 계좌 입금 내역과 입금자명을 확인해주세요/);
  assert.match(page, /pendingPaymentConfirmation\.claim\.depositorName/);
  assert.match(page, /pendingPaymentConfirmation\.claim\.transferAccount/);
  assert.match(page, /신청 확정 · 버스표 발급/);
  assert.match(page, /const confirmPaymentInFlightRef = useRef\(false\)/);
  assert.match(
    page,
    /confirmPaymentInFlightRef\.current = true[\s\S]*confirmRemainingSeatPayment\(item\.reservationId\)[\s\S]*confirmPaymentInFlightRef\.current = false/
  );
  assert.doesNotMatch(
    page,
    /item\.claim\.amount\.toLocaleString\(\)\}원 입금을 확인하고 버스표를 확정할까요\?[\s\S]*window\.confirm/
  );
});

test('remaining seat temporary claim cancellation uses a scoped safety modal', () => {
  assert.match(page, /setPendingClaimCancellation\(item\)/);
  assert.match(page, /role="dialog"/);
  assert.match(page, /입금 확인 전인 임시 확보를 취소합니다/);
  assert.match(page, /판매와 버스 공개 설정이 켜져 있을 때 다시 신청할 수 있습니다/);
  assert.match(page, /임시 확보 해제 · 잔여 좌석 반환/);
  assert.match(page, /pendingClaimCancellation\.claim\.seatNumber/);
  assert.match(page, /autoFocus/);
  assert.doesNotMatch(
    page,
    /item\.name\}님의 임시 확보를 취소하고 좌석을 다시 공개할까요\?[\s\S]*window\.confirm/
  );
});

test('remaining seat temporary claim cancellation blocks duplicate execution', () => {
  assert.match(page, /const cancelClaimInFlightRef = useRef\(false\)/);
  assert.match(
    page,
    /cancelClaimInFlightRef\.current = true[\s\S]*cancelRemainingSeatClaim\(item\.reservationId\)[\s\S]*cancelClaimInFlightRef\.current = false/
  );
});
