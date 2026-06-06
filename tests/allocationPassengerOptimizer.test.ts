import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  assignPassengersToPreferredBuses,
  optimizePassengerAssignmentsForMinimumCost,
} from '../src/lib/admin/allocationPassengerOptimizer.js';

describe('assignPassengersToPreferredBuses', () => {
  it('keeps campus teams together while respecting capacity', () => {
    const buses = [
      { id: 'a-1', label: '1호차', capacity: 2, price: 100, destination: 'A' },
      { id: 'a-2', label: '2호차', capacity: 3, price: 100, destination: 'A' },
    ];
    const passengers = [
      ...['가', '나', '다'].map((name, index) => ({
        reservationId: `team-${index}`,
        name,
        campus: '서울',
        team: '1팀',
        preferences: ['A', 'B'],
        busId: null,
        seatNumber: null,
      })),
      {
        reservationId: 'other',
        name: '라',
        campus: '서울',
        team: '2팀',
        preferences: ['A', 'B'],
        busId: null,
        seatNumber: null,
      },
    ];

    const result = assignPassengersToPreferredBuses(buses, passengers);
    const teamBusIds = new Set(
      result.passengers
        .filter((passenger) => passenger.team === '1팀')
        .map((passenger) => passenger.busId)
    );

    assert.deepEqual([...teamBusIds], ['a-2']);
    assert.equal(
      result.passengers.filter((passenger) => passenger.busId === 'a-2').length,
      3
    );
  });

  it('leaves passengers unassigned when no preferred bus has capacity', () => {
    const buses = [
      { id: 'a', label: '1호차', capacity: 1, price: 100, destination: 'A' },
    ];
    const passengers = ['가', '나'].map((name, index) => ({
      reservationId: `p-${index}`,
      name,
      campus: '서울',
      team: '1팀',
      preferences: ['A', 'B'],
      busId: null,
      seatNumber: null,
    }));

    const result = assignPassengersToPreferredBuses(buses, passengers);

    assert.equal(
      result.passengers.filter((passenger) => passenger.busId === 'a').length,
      1
    );
    assert.equal(
      result.passengers.filter((passenger) => passenger.busId === null).length,
      1
    );
  });
});

describe('optimizePassengerAssignmentsForMinimumCost', () => {
  it('moves passengers to their second choice when that removes a bus', () => {
    const buses = [
      {
        id: 'a',
        label: '1호차',
        capacity: 10,
        price: 100,
        destination: 'A',
      },
      {
        id: 'b',
        label: '2호차',
        capacity: 20,
        price: 100,
        destination: 'B',
      },
    ];
    const passengers = [
      ...Array.from({ length: 5 }, (_, index) => ({
        reservationId: `a-${index}`,
        preferences: ['A', 'B'],
        busId: 'a',
        seatNumber: index + 1,
      })),
      ...Array.from({ length: 10 }, (_, index) => ({
        reservationId: `b-${index}`,
        preferences: ['B', 'A'],
        busId: 'b',
        seatNumber: index + 1,
      })),
    ];

    const result = optimizePassengerAssignmentsForMinimumCost(buses, passengers);

    assert.equal(result.buses.length, 1);
    assert.equal(result.totalCost, 100);
    assert.equal(result.firstChoiceCoverage, (10 / 15) * 100);
    assert.equal(result.passengers.every((passenger) => passenger.busId === 'b'), true);
  });

  it('keeps a bus when passengers cannot move within their preferences', () => {
    const buses = [
      {
        id: 'a',
        label: '1호차',
        capacity: 10,
        price: 100,
        destination: 'A',
      },
      {
        id: 'b',
        label: '2호차',
        capacity: 10,
        price: 100,
        destination: 'B',
      },
    ];
    const passengers = [
      {
        reservationId: 'a-1',
        preferences: ['A'],
        busId: 'a',
        seatNumber: 1,
      },
      {
        reservationId: 'b-1',
        preferences: ['B'],
        busId: 'b',
        seatNumber: 1,
      },
    ];

    const result = optimizePassengerAssignmentsForMinimumCost(buses, passengers);

    assert.equal(result.buses.length, 2);
    assert.equal(result.totalCost, 200);
  });

  it('reroutes flexible passengers to free scarce seats and remove a bus', () => {
    const buses = [
      { id: 'remove', label: '1호차', capacity: 2, price: 300, destination: 'X' },
      { id: 'a', label: '2호차', capacity: 1, price: 100, destination: 'A' },
      { id: 'b', label: '3호차', capacity: 1, price: 100, destination: 'B' },
    ];
    const passengers = [
      {
        reservationId: 'flexible',
        preferences: ['A', 'B'],
        busId: 'remove',
        seatNumber: 1,
      },
      {
        reservationId: 'constrained',
        preferences: ['A'],
        busId: 'remove',
        seatNumber: 2,
      },
    ];

    const result = optimizePassengerAssignmentsForMinimumCost(buses, passengers);

    assert.equal(result.buses.some((bus) => bus.id === 'remove'), false);
    assert.equal(
      result.passengers.find((passenger) => passenger.reservationId === 'constrained')
        ?.busId,
      'a'
    );
    assert.equal(
      result.passengers.find((passenger) => passenger.reservationId === 'flexible')
        ?.busId,
      'b'
    );
  });
});
