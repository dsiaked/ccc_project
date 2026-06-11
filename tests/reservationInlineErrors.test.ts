import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const reservationPage = readFileSync('src/pages/ReservationPage.tsx', 'utf8');

test('reservation errors use inline status messages instead of browser alerts', () => {
  assert.doesNotMatch(reservationPage, /\b(?:window\.)?alert\s*\(/);
  assert.match(
    reservationPage,
    /setInitialLoadError\('지구 정보를 불러오지 못했습니다\. 다시 시도해주세요\.'\)/
  );
  assert.match(
    reservationPage,
    /stationPreference: '이미 2지망으로 선택한 행선지입니다\.'/
  );
  assert.match(
    reservationPage,
    /message: '로그인 정보를 불러올 수 없습니다\. 다시 로그인해주세요\.'/
  );
});
