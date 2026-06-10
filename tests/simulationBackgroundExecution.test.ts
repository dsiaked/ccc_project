import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const simulationPage = readFileSync(
  'src/pages/admin/AdminSimulationPage.tsx',
  'utf8'
);
const simulationExecutionService = readFileSync(
  'src/lib/admin/simulationExecutionService.ts',
  'utf8'
);

test('simulation stages run through an app-level execution service', () => {
  assert.match(simulationExecutionService, /let activeExecution:/);
  assert.match(
    simulationExecutionService,
    /if \(activeExecution\) return activeExecution/
  );
  assert.match(
    simulationExecutionService,
    /while \(!run\?\.done\)[\s\S]*runSimulationStage\(stage/
  );
  assert.match(
    simulationExecutionService,
    /while \(!run\?\.done\)[\s\S]*runSimulationStage\('cleanup'/
  );
});

test('simulation page subscribes to executions that outlive the page', () => {
  assert.match(simulationPage, /useSyncExternalStore\(/);
  assert.match(simulationPage, /subscribeSimulationExecution/);
  assert.match(simulationPage, /getSimulationExecutionSnapshot/);
  assert.match(simulationPage, /await startSimulationExecution\(/);
  assert.match(
    simulationPage,
    /if \(executionResult\.status !== 'idle'\)[\s\S]*return;[\s\S]*setRunningStageIndex\(index\)/
  );
});

test('simulation safety lock cannot be disabled during a background execution', () => {
  assert.match(
    simulationPage,
    /disabled=\{[\s\S]*updatingSafety[\s\S]*runningStageIndex !== null[\s\S]*!preview\?\.safety\.projectIdMatches/
  );
});

test('simulation preview ignores stale manual refreshes after a stage starts', () => {
  assert.match(
    simulationPage,
    /const previewRequestRevisionRef = useRef\(0\)[\s\S]*const requestRevision = \+\+previewRequestRevisionRef\.current[\s\S]*requestRevision !== previewRequestRevisionRef\.current/
  );
  assert.match(
    simulationPage,
    /previewRequestRevisionRef\.current \+= 1;\s*const executionResult = await startSimulationExecution/
  );
});
