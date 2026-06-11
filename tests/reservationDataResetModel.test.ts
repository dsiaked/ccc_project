import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  getOperationResetOptions,
  hasSelectedSetupReset,
  isMissingResetRpc,
  resetsAllOperationData,
  toReservationDataResetStats,
  type ReservationDataResetOptions,
} from '../src/lib/admin/reservationDataResetModel.js';

const adminService = readFileSync('src/lib/adminService.ts', 'utf8');
const resetService = readFileSync(
  'src/lib/admin/reservationDataResetService.ts',
  'utf8'
);

const createOptions = (
  overrides: Partial<ReservationDataResetOptions> = {}
): ReservationDataResetOptions => ({
  reservations: false,
  payments: false,
  campusTransfers: false,
  busAllocations: false,
  campusRequests: false,
  stations: false,
  busOptions: false,
  appSettings: false,
  homeAnnouncements: false,
  campusAdminRoles: false,
  organization: false,
  userAccounts: false,
  ...overrides,
});

test('reservation reset stats normalize missing and database numeric values', () => {
  const stats = toReservationDataResetStats({
    reservations: '3',
    payments: 2,
  });

  assert.equal(stats.reservations, 3);
  assert.equal(stats.payments, 2);
  assert.equal(stats.campusTransfers, 0);
  assert.equal(stats.userAccounts, 0);
});

test('reservation reset compatibility checks distinguish setup and operation resets', () => {
  const allOperations = getOperationResetOptions(
    createOptions({
      reservations: true,
      payments: true,
      campusTransfers: true,
      busAllocations: true,
      campusRequests: true,
    })
  );

  assert.equal(resetsAllOperationData(allOperations), true);
  assert.equal(
    resetsAllOperationData({ ...allOperations, p_reset_payments: false }),
    false
  );
  assert.equal(hasSelectedSetupReset(createOptions({ stations: true })), true);
  assert.equal(hasSelectedSetupReset(createOptions({ reservations: true })), false);
});

test('reservation reset recognizes every supported missing RPC error shape', () => {
  assert.equal(isMissingResetRpc({ code: 'PGRST202', message: 'missing' }), true);
  assert.equal(isMissingResetRpc({ code: '42883', message: 'missing' }), true);
  assert.equal(isMissingResetRpc({ message: 'schema cache stale' }), true);
  assert.equal(
    isMissingResetRpc({ message: 'Could not find the function reset' }),
    true
  );
  assert.equal(isMissingResetRpc({ code: '42501', message: 'denied' }), false);
});

test('admin service preserves reset exports while the focused service owns fallback behavior', () => {
  assert.match(
    adminService,
    /export \{[\s\S]*getReservationDataResetStats[\s\S]*resetReservationData[\s\S]*\} from '\.\/admin\/reservationDataResetService';/
  );
  assert.doesNotMatch(adminService, /export async function resetReservationData/);
  assert.match(resetService, /supabase\.rpc\('reset_reservation_data'/);
  assert.match(resetService, /resetsAllOperationData\(operationOptions\)/);
});
