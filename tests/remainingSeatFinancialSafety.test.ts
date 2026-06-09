import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const remainingSeatPage = readFileSync(
  'src/pages/RemainingSeatPage.tsx',
  'utf8'
);
const ticketPage = readFileSync('src/pages/TicketPage.tsx', 'utf8');

test('remaining seat claims require a valid payment account and positive amount', () => {
  assert.match(
    remainingSeatPage,
    /const hasValidPaymentInfo = \(option: RemainingSeatOption\) =>[\s\S]*typeof option\.transferAccount === 'string'[\s\S]*Boolean\(option\.transferAccount\.trim\(\)\)[\s\S]*Number\.isFinite\(option\.price\)[\s\S]*option\.price > 0/
  );
  assert.match(
    remainingSeatPage,
    /const handleClaim = \(\) => \{[\s\S]*if \(!hasValidPaymentInfo\(selectedOption\)\)[\s\S]*setClaimErrorMessage\(PAYMENT_INFO_UNAVAILABLE_MESSAGE\)/
  );
  assert.match(
    remainingSeatPage,
    /const handleConfirmPaid = async \(\) => \{[\s\S]*if \(!hasValidPaymentInfo\(selectedOption\)\)[\s\S]*setIsPaymentConfirmOpen\(false\)[\s\S]*setClaimErrorMessage\(PAYMENT_INFO_UNAVAILABLE_MESSAGE\)/
  );
  assert.match(
    remainingSeatPage,
    /disabled=\{saving \|\| !hasValidPaymentInfo\(selectedOption\)\}/
  );
  assert.match(
    remainingSeatPage,
    /결제 계좌 또는 금액이 등록되지 않아 신청할 수 없습니다\. 관리자에게 문의해주세요\./
  );
});

test('payment details stay hidden until a bus is selected', () => {
  assert.match(remainingSeatPage, /const commonSeatDetails = selectedOption;/);
  assert.doesNotMatch(remainingSeatPage, /selectedOption \?\? options\[0\]/);
});

test('claim failures survive the immediate options refresh', () => {
  const loadOptionsStart = remainingSeatPage.indexOf(
    'const loadOptions = async () =>'
  );
  const loadOptionsEnd = remainingSeatPage.indexOf(
    'useEffect(() =>',
    loadOptionsStart
  );
  const loadOptionsBlock = remainingSeatPage.slice(loadOptionsStart, loadOptionsEnd);

  assert.match(remainingSeatPage, /const \[loadErrorMessage, setLoadErrorMessage\]/);
  assert.match(remainingSeatPage, /const \[claimErrorMessage, setClaimErrorMessage\]/);
  assert.doesNotMatch(loadOptionsBlock, /setClaimErrorMessage\(''\)/);
  assert.match(
    remainingSeatPage,
    /setClaimErrorMessage\(getErrorMessage\(error\)\);\s*await loadOptions\(\);/
  );
});

test('remaining seat cancellation requires refund confirmation after payment', () => {
  assert.match(ticketPage, /setCancelDialogOpen\(true\)/);
  assert.match(ticketPage, /role="dialog"/);
  assert.match(
    ticketPage,
    /이미 입금했다면 환불은[\s\S]*자동 처리되지 않을 수 있으므로 관리자에게 문의하고 환불 여부를[\s\S]*반드시 확인해주세요\./
  );
  assert.match(ticketPage, /신청 취소는 환불 완료를 의미하지 않습니다\./);
  assert.match(ticketPage, /신청 취소 · 좌석 다시 공개/);
  assert.match(ticketPage, /className=\{styles\.modalCancelButton\}[\s\S]*autoFocus/);
  assert.doesNotMatch(ticketPage, /window\.confirm/);
});

test('remaining seat cancellation blocks duplicate requests and keeps failures visible', () => {
  assert.match(ticketPage, /const cancelInFlightRef = useRef\(false\)/);
  assert.match(
    ticketPage,
    /cancelInFlightRef\.current = true[\s\S]*cancelRemainingSeatClaim\(reservation\.id\)[\s\S]*cancelInFlightRef\.current = false/
  );
  assert.match(ticketPage, /setCancelError\('잔여 좌석 신청을 취소하지 못했습니다/);
  assert.match(ticketPage, /className=\{styles\.cancelError\} role="alert"/);
});

test('remaining seat payment confirmation focuses the safe cancellation action', () => {
  assert.match(
    remainingSeatPage,
    /className=\{styles\.modalCancelButton\}[\s\S]*?autoFocus/
  );
  assert.doesNotMatch(
    remainingSeatPage,
    /className=\{styles\.modalConfirmButton\}[\s\S]*?autoFocus/
  );
});
