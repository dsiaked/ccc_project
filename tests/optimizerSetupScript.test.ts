import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const setupScript = readFileSync('scripts/setup-local-optimizer.ps1', 'utf8');

test('local optimizer setup stops after native command failures', () => {
  assert.match(
    setupScript,
    /py install 3\.12[\s\S]*?\$exitCode = \$LASTEXITCODE[\s\S]*?if \(\$exitCode -ne 0\) \{[\s\S]*?Failed to install Python 3\.12 with py/,
  );
  assert.match(
    setupScript,
    /py -3\.12 -m venv \$venv[\s\S]*?\$exitCode = \$LASTEXITCODE[\s\S]*?if \(\$exitCode -ne 0\) \{[\s\S]*?Failed to create the local optimizer Python environment with py/,
  );
  assert.match(
    setupScript,
    /& \$python -m pip install[\s\S]*?\$exitCode = \$LASTEXITCODE[\s\S]*?if \(\$exitCode -ne 0\) \{[\s\S]*?Failed to install local optimizer Python dependencies with pip/,
  );
});
