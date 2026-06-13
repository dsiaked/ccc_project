import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const heroSection = readFileSync('src/components/HeroSection.tsx', 'utf8');

test('home explains the application and payment sequence before a first application', () => {
  assert.match(
    heroSection,
    /!isLoading &&[\s\S]*!loadError/
  );
  assert.match(heroSection, /버스 신청 → 배차 확정 → 탑승권 확인/);
});
