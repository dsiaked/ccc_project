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
    /?낃툑 怨꾩쥖 ?먮뒗 湲덉븸???깅줉?섏? ?딆븘 ?좎껌?????놁뒿?덈떎\. 愿由ъ옄?먭쾶 臾몄쓽?댁＜?몄슂\./
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

test('remaining seat cancellation warns paid users to check with an administrator', () => {
  assert.match(ticketPage, /setCancelDialogOpen\(true\)/);
  assert.match(ticketPage, /role="dialog"/);
  assert.match(ticketPage, /?좎껌 痍⑥냼 쨌 醫뚯꽍 ?ㅼ떆 怨듦컻/);
  assert.match(ticketPage, /className=\{styles\.modalCancelButton\}[\s\S]*autoFocus/);
  assert.doesNotMatch(ticketPage, /window\.confirm/);
});

test('remaining seat cancellation blocks duplicate requests and keeps failures visible', () => {
  assert.match(ticketPage, /const cancelInFlightRef = useRef\(false\)/);
  assert.match(
    ticketPage,
    /cancelInFlightRef\.current = true[\s\S]*cancelRemainingSeatClaim\(reservation\.id\)[\s\S]*cancelInFlightRef\.current = false/
  );
  assert.match(ticketPage, /setCancelError\('?붿뿬 醫뚯꽍 ?좎껌??痍⑥냼?섏? 紐삵뻽?듬땲??/);
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
