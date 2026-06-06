import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { calculateOptimalBusAllocation } from '../src/lib/admin/busAllocationAlgorithm.js';

describe('calculateOptimalBusAllocation', () => {
  it('returns no plans when there is no first-choice demand', () => {
    const results = calculateOptimalBusAllocation(
      {
        Seoul: { rank1: 0, rank2: 4, total: 4 },
      },
      [{ id: 'bus-1', capacity: 45, estimated_price: 900000 }]
    );

    assert.deepEqual(results, []);
  });

  it('selects a standard allocation that meets the minimum passenger rule', () => {
    const results = calculateOptimalBusAllocation(
      {
        Seoul: { rank1: 40, rank2: 0, total: 40 },
      },
      [
        { id: 'small', capacity: 20, estimated_price: 400000 },
        { id: 'large', capacity: 45, estimated_price: 900000 },
      ]
    );

    assert.equal(results[0]?.totalCapacity, 45);
    assert.equal(results[0]?.totalCost, 900000);
    assert.equal(
      results[0]?.routePlan.reduce(
        (sum, route) => sum + route.passengerCount,
        0
      ),
      40
    );
  });

  it('does not combine passengers going to different destinations', () => {
    const results = calculateOptimalBusAllocation(
      {
        Seoul: { rank1: 20, rank2: 0, total: 20 },
        Busan: { rank1: 20, rank2: 0, total: 20 },
      },
      [{ id: 'large', capacity: 45, estimated_price: 900000 }]
    );

    assert.deepEqual(results, []);
  });

  it('does not recommend a bus that remains at 35 or fewer passengers', () => {
    const results = calculateOptimalBusAllocation(
      {
        Seoul: { rank1: 35, rank2: 0, total: 35 },
      },
      [{ id: 'large', capacity: 45, estimated_price: 900000 }]
    );

    assert.deepEqual(results, []);
  });

  it('can leave low-utility demand unserved in preference-utility mode', () => {
    const results = calculateOptimalBusAllocation(
      {
        Seoul: { rank1: 10, rank2: 0, total: 10 },
        Busan: { rank1: 1, rank2: 0, total: 1 },
      },
      [{ id: 'bus-1', capacity: 10, estimated_price: 3 }],
      {
        firstChoiceWeight: 1,
        secondChoiceWeight: 0,
        usePreferenceUtility: true,
        minimumPassengersPerBus: 1,
      }
    );

    assert.equal(results[0]?.unservedPeople, 1);
    assert.equal(results[0]?.routePlan[0]?.destinations[0]?.name, 'Seoul');
  });

  it('does not exceed the registered maximum bus count', () => {
    const results = calculateOptimalBusAllocation(
      {
        Seoul: { rank1: 80, rank2: 0, total: 80 },
      },
      [
        {
          id: 'limited',
          capacity: 45,
          estimated_price: 900000,
          max_count: 1,
        },
      ]
    );

    assert.deepEqual(results, []);
  });
});
