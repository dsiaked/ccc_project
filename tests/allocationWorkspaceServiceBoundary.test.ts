import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const service = readFileSync(
  'src/lib/admin/allocationWorkspaceService.ts',
  'utf8'
);

test('allocation workspace service exposes the tested pure model rules', () => {
  assert.match(
    service,
    /mergeActivePassengersIntoDraft as mergeActivePassengersIntoDraftModel/
  );
  assert.match(service, /validateWorkspace as validateWorkspaceModel/);
  assert.match(
    service,
    /export const mergeActivePassengersIntoDraft = mergeActivePassengersIntoDraftModel;/
  );
  assert.match(
    service,
    /export const validateWorkspace = validateWorkspaceModel;/
  );
});
