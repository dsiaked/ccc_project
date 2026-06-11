import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const pullRequestWorkflow = readFileSync(
  '.github/workflows/firebase-hosting-pull-request.yml',
  'utf8'
).replaceAll('\r\n', '\n');

function jobSource(jobName: string, nextJobName?: string) {
  const startMarker = `  ${jobName}:\n`;
  const start = pullRequestWorkflow.indexOf(startMarker);
  assert.notEqual(start, -1, `Missing ${jobName} job.`);

  if (!nextJobName) return pullRequestWorkflow.slice(start);

  const end = pullRequestWorkflow.indexOf(`  ${nextJobName}:\n`, start + 1);
  assert.notEqual(end, -1, `Missing ${nextJobName} job.`);
  return pullRequestWorkflow.slice(start, end);
}

test('fork pull requests run secretless validation before any preview deployment', () => {
  const validateJob = jobSource('validate', 'build_and_preview');
  const previewJob = jobSource('build_and_preview');

  assert.doesNotMatch(validateJob, /if:\s*\$\{\{/);
  assert.doesNotMatch(validateJob, /secrets\./);

  for (const command of [
    'npm run lint',
    'npm run test:unit',
    'python -m pytest tests -q',
    'npm run build',
  ]) {
    assert.match(validateJob, new RegExp(command.replaceAll(' ', '\\s+')));
  }

  assert.match(
    previewJob,
    /if:\s*\$\{\{\s*github\.event\.pull_request\.head\.repo\.full_name\s*==\s*github\.repository\s*\}\}/
  );
  assert.match(previewJob, /needs:\s*validate/);
  assert.match(previewJob, /FirebaseExtended\/action-hosting-deploy@v0/);
});

test('fork pull request validation only receives read access', () => {
  const topLevelPermissions = pullRequestWorkflow.slice(
    pullRequestWorkflow.indexOf('permissions:'),
    pullRequestWorkflow.indexOf('jobs:')
  );
  const previewJob = jobSource('build_and_preview');

  assert.match(topLevelPermissions, /contents:\s*read/);
  assert.doesNotMatch(topLevelPermissions, /write/);
  assert.match(previewJob, /checks:\s*write/);
  assert.match(previewJob, /pull-requests:\s*write/);
});
