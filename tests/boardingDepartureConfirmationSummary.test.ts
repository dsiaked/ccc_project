import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const page = readFileSync('src/pages/admin/AdminBoardingPage.tsx', 'utf8');

test('departure confirmation shows the final boarded and no-show counts', () => {
  assert.match(page, /출발 완료 최종 확인/);
  assert.match(page, /selectedBusCounts\.boarded\.toLocaleString\(\)/);
  assert.match(page, /selectedBusCounts\.noShow\.toLocaleString\(\)/);
  assert.match(page, /selectedBusCounts\.total\.toLocaleString\(\)/);
  assert.match(page, /현황 확인 · 출발 완료/);
  assert.match(
    page,
    /const handleDeparture = \(\) => \{[\s\S]*setDepartureConfirmOpen\(true\);/
  );
  assert.match(
    page,
    /const confirmDeparture = \(\) => \{[\s\S]*markBoardingBusDeparted\(selectedBus\.id\)/
  );
});
