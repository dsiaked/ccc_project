import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

test('optimizer pytest dependencies and commands stay wired locally and in CI', () => {
  const packageJson = JSON.parse(readFileSync('package.json', 'utf8')) as {
    scripts: Record<string, string>;
  };
  const devRequirements = readFileSync(
    'optimizer/requirements-dev.txt',
    'utf8'
  );
  const localTestScript = readFileSync('scripts/test-optimizer.ps1', 'utf8');

  assert.match(devRequirements, /pytest>=8,<10/);
  assert.match(packageJson.scripts['optimizer:test'], /test-optimizer\.ps1/);
  assert.match(localTestScript, /pytest tests -q -p no:cacheprovider/);

  for (const workflow of [
    '.github/workflows/firebase-hosting-merge.yml',
    '.github/workflows/firebase-hosting-pull-request.yml',
  ]) {
    const source = readFileSync(workflow, 'utf8');

    assert.match(source, /optimizer\/requirements-dev\.txt/);
    assert.match(source, /python -m pytest tests -q/);
    assert.doesNotMatch(source, /python -m unittest discover/);
  }
});
