import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const files = [
  'src/components/Header.tsx',
  'src/components/Footer.tsx',
  'src/components/HeroSection.tsx',
  'src/components/FeatureSection.tsx',
  'src/components/ProcessSection.tsx',
  'src/components/HomeDeadlineBanner.tsx',
  'src/components/HomeNoticeSection.tsx',
  'src/pages/ReservationPage.tsx',
  'src/pages/TicketPage.tsx',
];

test('primary home components use readable Korean copy', () => {
  const source = files.map((file) => readFileSync(file, 'utf8')).join('\n');

  assert.match(source, /서울행 버스 신청/);
  assert.match(source, /귀가 버스를 편하게 신청하세요/);
  assert.match(source, /귀가 버스 이용 순서/);
  assert.match(source, /탑승권 확인하기/);
  assert.doesNotMatch(source, /버스표/);
  assert.doesNotMatch(source, /[濡踰좎댁뺤섏몄쒖吏]/u);
});
