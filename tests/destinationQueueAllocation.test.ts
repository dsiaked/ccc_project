import assert from 'node:assert/strict';
import test from 'node:test';

import {
  convertToDestinationQueueWorkspace,
  getDestinationQueueStats,
  isSecondChoiceDestinationAssignment,
  validateDestinationQueueWorkspace,
} from '../src/lib/admin/destinationQueueAllocation.js';

test('destination queue conversion keeps optimizer destination but removes buses and seats', () => {
  const converted = convertToDestinationQueueWorkspace({
    buses: [
      {
        id: 'bus-1',
        destination: '강남',
        departureTime: '15:00',
        boardingPlace: '종합운동장',
      },
    ],
    passengers: [
      {
        reservationId: 'r-1',
        name: '홍길동',
        phone: '010',
        campus: '서울',
        team: '1팀',
        preferences: ['강남', '잠실'],
        busId: 'bus-1',
        seatNumber: 12,
      },
    ],
  });

  assert.equal(converted.allocationStrategy, 'destination_queue');
  assert.deepEqual(converted.buses, []);
  assert.equal(converted.passengers[0].assignedDestination, '강남');
  assert.equal(converted.passengers[0].busId, null);
  assert.equal(converted.passengers[0].seatNumber, null);
  assert.deepEqual(converted.commonBoarding, {
    departureTime: '15:00',
    boardingPlace: '종합운동장',
  });
});

test('destination queue stats use fixed 44-person expected buses', () => {
  const passengers = Array.from({ length: 45 }, (_, index) => ({
    assignedDestination: '강남',
    preferences: index === 44 ? ['잠실', '강남'] : ['강남', '잠실'],
  }));

  assert.deepEqual(getDestinationQueueStats(passengers), [
    {
      destination: '강남',
      passengerCount: 45,
      firstChoiceCount: 44,
      secondChoiceCount: 1,
      expectedBusCount: 2,
      remainderCount: 1,
    },
  ]);
});

test('destination queue stats expose zero remainder for exact bus multiples', () => {
  const passengers = Array.from({ length: 88 }, () => ({
    assignedDestination: '강남',
    preferences: ['강남', '잠실'],
  }));

  assert.equal(getDestinationQueueStats(passengers)[0].remainderCount, 0);
});

test('second-choice assignment excludes duplicate first and second preferences', () => {
  assert.equal(isSecondChoiceDestinationAssignment({
    assignedDestination: '강남',
    preferences: ['잠실', '강남'],
  }), true);
  assert.equal(isSecondChoiceDestinationAssignment({
    assignedDestination: '강남',
    preferences: ['강남', '강남'],
  }), false);
});

test('destination queue validation requires common boarding info and destinations', () => {
  const errors = validateDestinationQueueWorkspace({
    commonBoarding: { departureTime: '', boardingPlace: '' },
    passengers: [
      {
        reservationId: 'r-1',
        name: '홍길동',
        phone: '010',
        campus: '서울',
        team: '1팀',
        preferences: ['강남', '잠실'],
        assignedDestination: '',
        busId: null,
        seatNumber: null,
      },
    ],
  });

  assert.equal(errors.length, 3);
});
