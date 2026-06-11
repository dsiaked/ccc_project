import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const sidebarStyles = readFileSync('src/components/Sidebar.module.css', 'utf8');

test('mobile sidebar keeps navigation scrollable without exposing a scrollbar gutter', () => {
  assert.match(sidebarStyles, /\.nav\s*\{[^}]*overflow-y:\s*auto;/s);
  assert.match(sidebarStyles, /\.nav\s*\{[^}]*scrollbar-width:\s*none;/s);
  assert.match(
    sidebarStyles,
    /\.nav::-webkit-scrollbar\s*\{\s*display:\s*none;\s*\}/s
  );
});
