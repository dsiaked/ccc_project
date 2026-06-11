import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const reservationPage = readFileSync('src/pages/ReservationPage.tsx', 'utf8');

test('logged-out reservation visitors see login guidance instead of the form', () => {
  assert.match(
    reservationPage,
    /\) : isLoginRequiredModalOpen \? \([\s\S]*styles\.loginRequiredContainer/
  );
  assert.match(reservationPage, /로그인 후 버스를 신청할 수 있어요/);
  assert.match(
    reservationPage,
    /isLoginRequiredModalOpen && \([\s\S]*<LoginRequiredModal/
  );
});
