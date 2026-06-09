import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const simulationSource = readFileSync('scripts/simulation.mjs', 'utf8');

test('full simulation cleanup requires a distinct allowed test project', () => {
  assert.match(
    simulationSource,
    /function assertFullCleanupProjectAllowed\(\)/,
  );
  assert.match(
    simulationSource,
    /if \(allowedProjectId === productionProjectId\)/,
  );
  assert.match(
    simulationSource,
    /if \(currentProjectId === productionProjectId\)/,
  );
  assert.match(
    simulationSource,
    /if \(currentProjectId !== allowedProjectId\)/,
  );
  assert.match(
    simulationSource,
    /async function cleanup\(\) \{\s+assertFullCleanupProjectAllowed\(\);/,
  );
});
