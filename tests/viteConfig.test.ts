import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

test('Vite uses a stable HTML entry for Windows reparse-point workspaces', () => {
  const viteConfig = readFileSync('vite.config.ts', 'utf8');

  assert.match(viteConfig, /rolldownOptions[\s\S]*input:[\s\S]*index: 'index\.html'/);
});
