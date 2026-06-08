import assert from 'node:assert/strict';
import test from 'node:test';

import {
  getBelowMinimumBusIds,
  getFirstChoiceCoverage,
  getOutOfPreferencePassengerIds,
  getWorkspaceTotals,
  mergeActivePassengersIntoDraft,
  validateWorkspace,
  type AllocationWorkspaceBus,
  type AllocationWorkspaceData,
  type AllocationWorkspacePassenger,
} from '../src/lib/admin/allocationWorkspaceModel.js';

const bus = (
  id: string,
  label: string,
  destination: string,
  overrides: Partial<AllocationWorkspaceBus> = {}
): AllocationWorkspaceBus => ({
  id,
  optionId: 'standard',
  label,
  capacity: 2,
  price: 100,
  maxAvailableCount: 2,
  destination,
  departureTime: '10:00',
  boardingPlace: 'Gate A',
  minimumPassengers: 1,
  ...overrides,
});

const passenger = (
  reservationId: string,
  name: string,
  preferences: string[],
  overrides: Partial<AllocationWorkspacePassenger> = {}
): AllocationWorkspacePassenger => ({
  reservationId,
  name,
  phone: '010-0000-0000',
  campus: 'Campus A',
  team: 'Team A',
  preferences,
  source: 'regular',
  busId: null,
  seatNumber: null,
  ...overrides,
});

const workspace = (
  overrides: Partial<AllocationWorkspaceData> = {}
): AllocationWorkspaceData => ({
  schemaVersion: 2,
  status: 'draft',
  sourceAllocation: {},
  optimization: {
    mode: 'manual',
    firstChoiceWeight: 1,
    costWeight: 1,
  },
  allowMinimumPassengerOverride: true,
  allowOutOfPreferenceOverride: true,
  history: [],
  buses: [],
  passengers: [],
  ...overrides,
});

test('refresh keeps existing passenger order and avoids false-positive changes', () => {
  const current = workspace({
    passengers: [
      passenger('p-2', 'Bravo', ['South', 'North'], {
        busId: 'bus-2',
        seatNumber: 2,
      }),
      passenger('p-1', 'Alpha', ['North', 'South'], {
        busId: 'bus-1',
        seatNumber: 1,
      }),
    ],
  });

  const refreshed = mergeActivePassengersIntoDraft(current, [
    passenger('p-1', 'Alpha', ['North', 'South'], {
      busId: 'bus-1',
      seatNumber: 1,
    }),
    passenger('p-2', 'Bravo', ['South', 'North'], {
      busId: 'bus-2',
      seatNumber: 2,
    }),
  ]);

  assert.strictEqual(refreshed, current);
});

test('refresh adds a new bus when no preferred seat remains for new passengers', () => {
  const current = workspace({
    buses: [bus('bus-1', 'North 1', 'North', { capacity: 1 })],
    passengers: [
      passenger('p-1', 'Alpha', ['North', 'South'], {
        busId: 'bus-1',
        seatNumber: 1,
      }),
    ],
  });

  const refreshed = mergeActivePassengersIntoDraft(current, [
    passenger('p-1', 'Alpha', ['North', 'South'], {
      busId: 'bus-1',
      seatNumber: 1,
    }),
    passenger('p-2', 'Bravo', ['North', 'South']),
  ]);

  assert.notStrictEqual(refreshed, current);
  assert.equal(refreshed.buses.length, 2);
  assert.equal(refreshed.passengers.length, 2);
  assert.equal(refreshed.allowMinimumPassengerOverride, false);
  assert.equal(refreshed.allowOutOfPreferenceOverride, false);
  assert.equal(refreshed.outOfPreferenceAcknowledgement, undefined);
  assert.match(refreshed.buses[1].label, /^North 추가 \d+$/);
  assert.equal(refreshed.buses[1].destination, 'North');
  assert.equal(refreshed.passengers[1].busId, refreshed.buses[1].id);
  assert.equal(refreshed.passengers[1].seatNumber, 1);
  assert.equal(refreshed.history.at(-1)?.action, 'active_reservations_refreshed');
});

test('workspace metrics ignore remaining-seat overrides but keep operational warnings', () => {
  const current = workspace({
    buses: [
      bus('bus-1', 'North 1', 'North', { minimumPassengers: 1 }),
      bus('bus-2', 'South 1', 'South', { minimumPassengers: 2 }),
    ],
    passengers: [
      passenger('p-1', 'Alpha', ['North', 'East'], {
        busId: 'bus-1',
        seatNumber: 1,
      }),
      passenger('p-2', 'Bravo', ['North', 'East'], {
        busId: 'bus-2',
        seatNumber: 1,
      }),
      passenger('p-3', 'Charlie', ['North'], {
        source: 'remaining_seat',
        remainingSeatStatus: 'confirmed',
        busId: 'bus-2',
        seatNumber: 2,
      }),
    ],
  });

  const validation = validateWorkspace(current);

  assert.equal(getFirstChoiceCoverage(current), 50);
  assert.deepEqual(getOutOfPreferencePassengerIds(current), ['p-2']);
  assert.deepEqual(getBelowMinimumBusIds(current), []);
  assert.deepEqual(getWorkspaceTotals(current), {
    totalCost: 200,
    totalCapacity: 4,
  });
  assert.equal(validation.errors.length, 0);
  assert.equal(validation.warnings.length, 1);
  assert.match(validation.warnings[0], /South/);
});

test('workspace validation reports invalid assignments, duplicate seats, and below-minimum buses', () => {
  const current = workspace({
    buses: [
      bus('bus-1', 'North 1', 'North', {
        capacity: 2,
        minimumPassengers: 3,
        maxAvailableCount: 1,
      }),
      bus('bus-2', 'North 2', 'North', {
        capacity: 2,
        minimumPassengers: 1,
        maxAvailableCount: 1,
      }),
    ],
    passengers: [
      passenger('p-1', 'Alpha', ['North', 'South'], {
        busId: 'bus-1',
        seatNumber: 1,
      }),
      passenger('p-1', 'Alpha Copy', ['North', 'South'], {
        busId: 'bus-1',
        seatNumber: 1,
      }),
      passenger('p-3', 'Ghost', ['North', 'South'], {
        busId: 'missing-bus',
        seatNumber: 1,
      }),
    ],
  });

  const validation = validateWorkspace(current);

  assert.equal(validation.errors.length, 4);
  assert.ok(validation.errors.some((message) => message.includes('중복 배정')));
  assert.ok(validation.errors.some((message) => message.includes('좌석이 중복')));
  assert.ok(
    validation.errors.some((message) => message.includes('존재하지 않는 버스'))
  );
  assert.ok(validation.errors.some((message) => message.includes('최대 1대')));
  assert.deepEqual(getBelowMinimumBusIds(current), ['bus-1', 'bus-2']);
  assert.equal(validation.warnings.length, 2);
  assert.ok(
    validation.warnings.some((message) => message.includes('최소 탑승 인원 3명'))
  );
  assert.ok(
    validation.warnings.some((message) => message.includes('최소 탑승 인원 1명'))
  );
});
