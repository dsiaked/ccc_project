import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const footer = readFileSync('src/components/Footer.tsx', 'utf8');

test('home footer quick links lead to real destinations', () => {
  assert.match(footer, /<Link to="\/reservation"/);
  assert.match(footer, /<Link to="\/ticket"/);
  assert.match(footer, /href="mailto:info@ccc-bus\.org"/);
  assert.doesNotMatch(footer, /href="#"/);
});
