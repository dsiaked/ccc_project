import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const header = readFileSync('src/components/Header.tsx', 'utf8');

test('home screen sidebar supports touch swipes from the right edge', () => {
  assert.match(header, /if \(location\.pathname !== '\/'\) return/);
  assert.match(header, /touch\.clientX >= window\.innerWidth - SWIPE_EDGE_WIDTH/);
  assert.match(header, /!isSidebarOpen && distanceX < 0/);
  assert.match(header, /setHasOpenedSidebar\(true\)/);
  assert.match(header, /setIsSidebarOpen\(true\)/);
});

test('open home screen sidebar closes with the reverse swipe', () => {
  assert.match(header, /isSidebarOpen && distanceX > 0/);
  assert.match(header, /closeSidebar\(\)/);
  assert.match(header, /Math\.abs\(distanceX\) > Math\.abs\(distanceY\) \* 1\.2/);
  assert.match(header, /window\.addEventListener\('touchcancel', resetSwipe/);
});
