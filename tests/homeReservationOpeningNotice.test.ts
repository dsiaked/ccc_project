import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const banner = readFileSync('src/components/HomeDeadlineBanner.tsx', 'utf8');
const hero = readFileSync('src/components/HeroSection.tsx', 'utf8');

test('home banner announces the reservation opening time before applications open', () => {
  assert.match(banner, /setOpensAt\(setting\.opensAt\)/);
  assert.match(banner, /isBeforeOpening[\s\S]*신청 시작 전/);
  assert.match(
    banner,
    /신청 시작 일시: \{formatReservationDeadline\(opensAt\)\}/
  );
});

test('home hero blocks new applications and shows the opening time before applications open', () => {
  assert.match(
    hero,
    /isNewApplicationBeforeOpening = isBeforeOpening && !reservation/
  );
  assert.match(
    hero,
    /description: `\$\{formatReservationDeadline\(opensAt\)\}부터 버스 신청을 시작할 수 있습니다\.`/
  );
  assert.match(
    hero,
    /disabled=\{isLoading \|\| isNewApplicationBeforeOpening\}/
  );
});
