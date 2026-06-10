import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  assertSimulationRequestWithinLimit,
  assertStableSimulationRun,
  getNextSimulationBatchOffset,
  getNextSimulationCleanupRemaining,
} from '../src/lib/admin/simulationProgressGuard.js';

const simulationExecutionService = readFileSync(
  'src/lib/admin/simulationExecutionService.ts',
  'utf8'
);

test('simulation batch execution rejects responses that would repeat a batch', () => {
  assert.throws(
    () => getNextSimulationBatchOffset('accounts', 200, 200),
    /made no progress/
  );
  assert.throws(
    () => getNextSimulationBatchOffset('reservations', 200, 100),
    /made no progress/
  );
  assert.throws(
    () => getNextSimulationBatchOffset('payments', 200, null),
    /made no progress/
  );
  assert.equal(getNextSimulationBatchOffset('accounts', 200, 300), 300);
});

test('simulation execution rejects a changed run id before continuing', () => {
  assert.doesNotThrow(() =>
    assertStableSimulationRun('accounts', undefined, 'run-1')
  );
  assert.doesNotThrow(() =>
    assertStableSimulationRun('accounts', 'run-1', 'run-1')
  );
  assert.throws(
    () => assertStableSimulationRun('accounts', 'run-1', 'run-2'),
    /changed unexpectedly/
  );
  assert.throws(
    () => assertStableSimulationRun('accounts', undefined, 'undefined'),
    /invalid run id/
  );
});

test('simulation execution bounds even continuously advancing batches', () => {
  assert.doesNotThrow(() =>
    assertSimulationRequestWithinLimit('accounts', 9_999)
  );
  assert.throws(
    () => assertSimulationRequestWithinLimit('accounts', 10_000),
    /maximum batch request count/
  );
});

test('simulation cleanup rejects invalid or stalled remaining counts', () => {
  assert.equal(getNextSimulationCleanupRemaining(null, 20), 20);
  assert.equal(getNextSimulationCleanupRemaining(20, 10), 10);
  assert.throws(
    () => getNextSimulationCleanupRemaining(10, 10),
    /made no progress/
  );
  assert.throws(
    () => getNextSimulationCleanupRemaining(10, 11),
    /made no progress/
  );
  assert.throws(
    () => getNextSimulationCleanupRemaining(null, undefined),
    /invalid remaining count/
  );
});

test('simulation execution applies progress guards before repeating stages', () => {
  assert.match(
    simulationExecutionService,
    /assertSimulationRequestWithinLimit\(stage, requestCount\)[\s\S]*assertStableSimulationRun\(stage, runId, run\.id\)[\s\S]*if \(!run\.done\) \{[\s\S]*getNextSimulationBatchOffset/
  );
  assert.match(
    simulationExecutionService,
    /assertSimulationRequestWithinLimit\('cleanup', requestCount\)[\s\S]*assertStableSimulationRun\('cleanup', runId, run\.id\)[\s\S]*if \(!run\.done\) \{[\s\S]*getNextSimulationCleanupRemaining/
  );
});
