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

  it('selects the lowest-cost standard allocation with enough capacity', () => {
    const results = calculateOptimalBusAllocation(
      {
        Seoul: { rank1: 40, rank2: 0, total: 40 },
      },
      [
        { id: 'small', capacity: 20, estimated_price: 400000 },
        { id: 'large', capacity: 45, estimated_price: 900000 },
      ]
    );

    assert.equal(results[0]?.totalCapacity, 40);
    assert.equal(results[0]?.totalCost, 800000);
    assert.equal(
      results[0]?.routePlan.reduce(
        (sum, route) => sum + route.passengerCount,
        0
      ),
      40
    );
  });

  it('keeps different destinations on separate buses', () => {
    const results = calculateOptimalBusAllocation(
      {
        Seoul: { rank1: 20, rank2: 0, total: 20 },
        Busan: { rank1: 20, rank2: 0, total: 20 },
      },
      [{ id: 'large', capacity: 45, estimated_price: 900000 }]
    );

    assert.equal(results[0]?.totalBuses, 2);
    assert.deepEqual(
      results[0]?.routePlan
        .map((route) => route.destinations[0]?.name)
        .sort(),
      ['Busan', 'Seoul']
    );
  });

  it('keeps a low-occupancy recommendation for administrator override', () => {
    const results = calculateOptimalBusAllocation(
      {
        Seoul: { rank1: 35, rank2: 0, total: 35 },
      },
      [{ id: 'large', capacity: 45, estimated_price: 900000 }]
    );

    assert.equal(results[0]?.routePlan[0]?.passengerCount, 35);
  });

  it('keeps all demand served in preference-utility mode', () => {
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

    assert.equal(results[0]?.unservedPeople, 0);
    assert.deepEqual(
      results[0]?.routePlan
        .map((route) => route.destinations[0]?.name)
        .sort(),
      ['Busan', 'Seoul']
    );
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
