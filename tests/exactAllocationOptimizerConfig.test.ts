import assert from 'node:assert/strict';
import test from 'node:test';

import { normalizeExactAllocationOptimizerConfig } from '../src/lib/admin/exactAllocationOptimizerConfig.js';

test('optimizer config fills fields omitted by an older save RPC response', () => {
  const fallback = {
    capacity: 45,
    price: 1200000,
    recommended_minimum_passengers: 36,
    maximum_buses: 12,
  };

  assert.deepEqual(
    normalizeExactAllocationOptimizerConfig(
      {
        capacity: 45,
        price: 1200000,
        recommended_minimum_passengers: 35,
      },
      fallback
    ),
    {
      capacity: 45,
      price: 1200000,
      recommended_minimum_passengers: 35,
      maximum_buses: 12,
    }
  );
});

test('optimizer config uses stable defaults for an invalid response', () => {
  assert.deepEqual(normalizeExactAllocationOptimizerConfig(null), {
    capacity: 45,
    price: 0,
    recommended_minimum_passengers: 36,
    maximum_buses: 999,
  });
});
