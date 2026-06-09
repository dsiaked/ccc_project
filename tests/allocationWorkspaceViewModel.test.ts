import assert from 'node:assert/strict';
import test from 'node:test';

import {
  getNextSeatNumber,
  getSharedBusField,
  getWorkspaceIssueTargets,
  groupValidationErrors,
} from '../src/pages/admin/allocationWorkspaceViewModel.js';

test('workspace validation errors are grouped by corrective action', () => {
  const groups = groupValidationErrors([
    '탑승자 A가 미배차 상태입니다.',
    '버스 A의 좌석이 중복되었습니다.',
    '알 수 없는 차단 오류',
  ]);

  assert.deepEqual(
    groups.map(({ id, items }) => ({ id, items })),
    [
      { id: 'unassigned', items: ['탑승자 A가 미배차 상태입니다.'] },
      { id: 'capacity-seat', items: ['버스 A의 좌석이 중복되었습니다.'] },
      { id: 'other', items: ['알 수 없는 차단 오류'] },
    ]
  );
});

test('shared bus fields distinguish common and mixed values', () => {
  assert.deepEqual(
    getSharedBusField(
      [
        { departureTime: '10:00', boardingPlace: '정문' },
        { departureTime: '10:00', boardingPlace: '후문' },
      ],
      'departureTime'
    ),
    { value: '10:00', isMixed: false }
  );
  assert.deepEqual(
    getSharedBusField(
      [
        { departureTime: '10:00', boardingPlace: '정문' },
        { departureTime: '11:00', boardingPlace: '정문' },
      ],
      'departureTime'
    ),
    { value: '', isMixed: true }
  );
});

test('next seat calculation fills the first available seat', () => {
  const workspace = {
    buses: [{ id: 'bus-1', capacity: 3 }],
    passengers: [
      { busId: 'bus-1', seatNumber: 1 },
      { busId: 'bus-1', seatNumber: 3 },
      { busId: null, seatNumber: null },
    ],
  };

  assert.equal(getNextSeatNumber(workspace, 'bus-1'), 2);
  assert.equal(getNextSeatNumber(workspace, 'missing-bus'), null);
});

test('workspace issue targets identify bus and passenger corrections', () => {
  const targets = getWorkspaceIssueTargets({
    buses: [
      {
        id: 'bus-1',
        optionId: 'standard',
        label: '1호차',
        capacity: 1,
        price: 100,
        maxAvailableCount: 1,
        destination: '강남',
      },
      {
        id: 'bus-2',
        optionId: 'standard',
        label: '1호차',
        capacity: 1,
        price: 100,
        maxAvailableCount: 1,
        destination: '',
      },
    ],
    passengers: [
      {
        reservationId: 'regular-1',
        preferences: ['잠실'],
        busId: 'bus-1',
        seatNumber: 1,
      },
      {
        reservationId: 'regular-2',
        preferences: ['강남', '잠실'],
        busId: 'bus-1',
        seatNumber: 1,
      },
      {
        reservationId: 'unassigned',
        preferences: ['강남', '잠실'],
        busId: null,
        seatNumber: null,
      },
    ],
  });

  assert.deepEqual([...targets.busIds].sort(), ['bus-1', 'bus-2']);
  assert.deepEqual(
    [...(targets.busFields.get('bus-1') ?? [])].sort(),
    ['availability', 'capacity', 'label']
  );
  assert.deepEqual(
    [...(targets.passengerFields.get('regular-1') ?? [])].sort(),
    ['assignment', 'preferences', 'seat']
  );
  assert.deepEqual(
    [...(targets.passengerFields.get('regular-2') ?? [])],
    ['seat']
  );
  assert.equal(targets.hasUnassignedIssue, true);
});

test('remaining-seat passengers may use their directly selected destination', () => {
  const targets = getWorkspaceIssueTargets({
    buses: [
      {
        id: 'bus-1',
        label: '1호차',
        capacity: 1,
        price: 100,
        destination: '강남',
      },
    ],
    passengers: [
      {
        reservationId: 'remaining-seat',
        preferences: ['잠실'],
        source: 'remaining_seat',
        remainingSeatStatus: 'confirmed',
        busId: 'bus-1',
        seatNumber: 1,
      },
    ],
  });

  assert.equal(targets.passengerIds.size, 0);
});
