import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const heroSection = readFileSync('src/components/HeroSection.tsx', 'utf8');

test('home explains the application and payment sequence before a first application', () => {
  assert.match(
    heroSection,
    /!isLoading && !loadError && !reservation && !canBookRemainingSeat/
  );
  assert.match(heroSection, /버스 신청 → 배차 확정 → 결제 안내 → 탑승권 확인/);
  assert.match(heroSection, /버스 요금과 결제 방법은 배차 확정 후 안내됩니다/);
});
