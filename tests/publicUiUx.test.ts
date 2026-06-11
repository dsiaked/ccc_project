import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const readSource = (path: string) => readFileSync(path, 'utf8');

test('home notifications scroll and focus the notice section', () => {
  const header = readSource('src/components/Header.tsx');
  const home = readSource('src/pages/HomePage.tsx');
  const notices = readSource('src/components/HomeNoticeSection.tsx');

  assert.match(header, /handleNotificationClick/);
  assert.match(header, /noticeSection\.scrollIntoView/);
  assert.match(header, /noticeSection\.focus/);
  assert.match(home, /location\.hash[\s\S]*scrollIntoView[\s\S]*focus/);
  assert.match(notices, /id="notices"[\s\S]*tabIndex=\{-1\}/);
});

test('public navigation preloads lazy routes from user intent', () => {
  const routes = readSource('src/routes/publicRoutes.tsx');
  const sidebar = readSource('src/components/Sidebar.tsx');

  assert.match(routes, /export const preloadPublicRoute/);
  assert.match(sidebar, /onMouseOver=\{\(event\) => preloadNavTarget/);
  assert.match(sidebar, /onFocusCapture=\{\(event\) => preloadNavTarget/);
  assert.match(sidebar, /data-route-path="\/reservation"/);
});

test('home loading and hero image avoid unnecessary layout and transfer cost', () => {
  const deadline = readSource('src/components/HomeDeadlineBanner.tsx');
  const hero = readSource('src/components/HeroSection.tsx');

  assert.match(deadline, /styles\.loadingBanner/);
  assert.match(hero, /srcSet=/);
  assert.match(hero, /sizes=/);
});
