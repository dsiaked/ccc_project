import assert from 'node:assert/strict';
import test from 'node:test';

import { formatBusLabel } from '../src/utils/busLabel.js';

test('formats legacy English bus labels as Korean vehicle numbers', () => {
  assert.equal(formatBusLabel('1 bus'), '1호차');
  assert.equal(formatBusLabel('BUS 2'), '2호차');
  assert.equal(formatBusLabel('bus-003'), '3호차');
  assert.equal(formatBusLabel('4호차'), '4호차');
});
