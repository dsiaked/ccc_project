import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const ticketPage = readFileSync('src/pages/TicketPage.tsx', 'utf8');
const heroSection = readFileSync('src/components/HeroSection.tsx', 'utf8');

test('ticket load failures render a retryable error instead of the empty reservation state', () => {
  assert.match(
    ticketPage,
    /setLoadError\('신청 정보를 불러오지 못했습니다\. 잠시 후 다시 시도해주세요\.'\)/
  );
  assert.match(ticketPage, /if \(sessionError\) \{\s*throw sessionError;/);
  assert.match(ticketPage, /\) : loadError \? \([\s\S]*role="alert"/);
  assert.match(
    ticketPage,
    /onClick=\{\(\) => setLoadAttempt\(\(attempt\) => attempt \+ 1\)\}/
  );
});

test('home hero load failures offer retry instead of navigating to a new reservation', () => {
  assert.match(
    heroSection,
    /loadError[\s\S]*title: '신청 정보를 확인하지 못했습니다'[\s\S]*buttonLabel: '다시 시도'/
  );
  assert.match(heroSection, /if \(sessionError\) throw sessionError;/);
  assert.match(
    heroSection,
    /if \(loadError\) \{[\s\S]*setLoadAttempt\(\(attempt\) => attempt \+ 1\)[\s\S]*return;[\s\S]*\}[\s\S]*navigate\(content\.path\)/
  );
});

test('remaining seat cancellation verifies committed state after a lost response', () => {
  assert.match(
    ticketPage,
    /catch \(error\) \{[\s\S]*const currentReservation = await getReservation\(\)[\s\S]*!currentReservation \|\| currentReservation\.status === 'cancelled'[\s\S]*navigate\('\/remaining-seats'/
  );
});
