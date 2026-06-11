import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  mapDestinationStats,
  normalizeBusTicketPrice,
} from '../src/lib/admin/busAllocationModel.js';

const adminService = readFileSync('src/lib/adminService.ts', 'utf8');
const busAllocationService = readFileSync(
  'src/lib/admin/busAllocationService.ts',
  'utf8'
);

test('destination statistics normalize database numeric values', () => {
  assert.deepEqual(
    mapDestinationStats([
      { station_name: 'station-1', rank1: '2', rank2: 3, total: '5' },
    ]),
    {
      'station-1': { rank1: 2, rank2: 3, total: 5 },
    }
  );
});

test('bus ticket prices preserve the existing non-negative integer normalization', () => {
  assert.equal(normalizeBusTicketPrice(12_345.9), 12_345);
  assert.equal(normalizeBusTicketPrice(-1), 0);
  assert.equal(normalizeBusTicketPrice(Number.NaN), Number.NaN);
});

test('admin service preserves bus allocation exports while the domain service owns implementation', () => {
  assert.match(
    adminService,
    /export \{[\s\S]*getBusTicketPrice[\s\S]*\} from '\.\/admin\/busAllocationService';/
  );
  assert.doesNotMatch(adminService, /export async function getBusTicketPrice/);
  assert.match(busAllocationService, /supabase\.rpc\('get_bus_ticket_price'\)/);
  assert.match(
    busAllocationService,
    /supabase\.rpc\('upsert_bus_option_as_global_admin'/
  );
});
