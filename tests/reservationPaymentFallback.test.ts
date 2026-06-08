import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const reservationPage = readFileSync('src/pages/ReservationPage.tsx', 'utf8');
const paymentLoadErrorStart = reservationPage.indexOf(
  "console.error('입금 정보 로드 실패:'"
);
const paymentLoadErrorBlock = reservationPage.slice(
  paymentLoadErrorStart,
  reservationPage.indexOf('} finally {', paymentLoadErrorStart)
);

test('reservation can continue when payment details were announced outside the app', () => {
  assert.match(
    reservationPage,
    /setCanConfirmWithAnnouncedPaymentInfo\(true\)[\s\S]*카카오톡 등으로 안내받은 계좌에 입금했다면 신청을 계속할 수 있습니다/
  );
  assert.match(
    reservationPage,
    /!canConfirmWithAnnouncedPaymentInfo[\s\S]*Boolean\(paymentInfoError\)/
  );
});

test('payment information load errors do not enable the announcement fallback', () => {
  assert.match(
    paymentLoadErrorBlock,
    /입금 정보를 불러오지 못했습니다\. 잠시 후 다시 시도해주세요\./
  );
  assert.doesNotMatch(
    paymentLoadErrorBlock,
    /setCanConfirmWithAnnouncedPaymentInfo\(true\)/
  );
});
