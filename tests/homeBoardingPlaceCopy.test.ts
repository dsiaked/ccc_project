import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const hero = readFileSync('src/components/HeroSection.tsx', 'utf8');
const styles = readFileSync('src/components/HeroSection.module.css', 'utf8');

test('confirmed home screen exposes a copyable boarding place', () => {
  assert.match(
    hero,
    /reservation\?\.confirmedTicket\?\.boardingPlace\?\.trim\(\)/
  );
  assert.match(hero, /isConfirmed && boardingPlace/);
  assert.match(hero, /navigator\.clipboard\.writeText\(boardingPlace\)/);
  assert.match(hero, /배차 완료 · 탑승 장소/);
  assert.match(hero, /탑승 장소 복사/);
  assert.match(hero, /복사 완료/);
});

test('boarding place copy action is mobile friendly and reports failures', () => {
  assert.match(hero, /탑승 장소 복사 실패/);
  assert.match(hero, /복사하지 못했습니다\. 잠시 후 다시 시도해주세요\./);
  assert.match(styles, /\.boardingPlaceCard\s*\{/);
  assert.match(styles, /\.boardingPlaceCopyButton\s*\{/);
  assert.match(
    styles,
    /@container \(max-width: 640px\)[\s\S]*\.boardingPlaceCopyButton\s*\{[\s\S]*width: 100%;/
  );
});
